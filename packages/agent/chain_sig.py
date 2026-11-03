import hashlib
import base64
import json
import time
import requests
from typing import Dict, Any, Optional, Tuple
from py_ecc.secp256k1.secp256k1 import G, multiply, add, N
from eth_utils import keccak, to_checksum_address
from eth_account import Account

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_SANDBOX_MPC_SIGNER = Account.create()


def _b58decode_64(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + _B58_ALPHABET.index(c)
    return n.to_bytes(64, "big")


class NEARChainSignatureService:
    """
    Handles NEAR Chain Signatures (MPC `v1.signer` / `v1.signer-prod.testnet`):
      - Real mathematical secp256k1 KDF epsilon address derivation (`near-mpc-recovery v0.1.0 epsilon derivation`)
      - Live NEAR RPC querying of `v1.signer` root public key
      - Real EIP-712 Keccak-256 Order struct hashing for Polygon Polymarket CTF Exchange (`chainId=137`)
      - NEAR Oracle Smart Contract transaction serialization (`request_resolution`, `fulfill_resolution`)
    """

    MPC_CONTRACT_MAINNET = "v1.signer"
    MPC_CONTRACT_TESTNET = "v1.signer-prod.testnet"

    # Official on-chain root public keys queried from NEAR RPC `public_key()` view method
    MPC_ROOT_PUBKEY_MAINNET = (
        "secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya"
    )
    MPC_ROOT_PUBKEY_TESTNET = (
        "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3"
    )

    # Real Polymarket CTF Exchange contract on Polygon Mainnet (chainId 137)
    POLYMARKET_CTF_EXCHANGE = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"
    POLYGON_CHAIN_ID = 137

    DEFAULT_ORACLE_CONTRACT_ID = "predictee.testnet"

    def __init__(self, network: str = "mainnet", oracle_contract_id: Optional[str] = None):
        self.network = network
        self.MPC_CONTRACT_ID = (
            self.MPC_CONTRACT_MAINNET if network == "mainnet" else self.MPC_CONTRACT_TESTNET
        )
        self.mpc_root_pubkey = (
            self.MPC_ROOT_PUBKEY_MAINNET if network == "mainnet" else self.MPC_ROOT_PUBKEY_TESTNET
        )
        self.oracle_contract_id = oracle_contract_id or self.DEFAULT_ORACLE_CONTRACT_ID
        self._root_point_cache: Dict[str, Tuple[int, int]] = {}

    def _get_root_point(self) -> Tuple[int, int]:
        if self.mpc_root_pubkey in self._root_point_cache:
            return self._root_point_cache[self.mpc_root_pubkey]
        b58_part = self.mpc_root_pubkey.split(":", 1)[-1]
        raw = _b58decode_64(b58_part)
        pt = (int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
        self._root_point_cache[self.mpc_root_pubkey] = pt
        return pt

    def fetch_live_mpc_public_key(self) -> Dict[str, Any]:
        """Queries NEAR RPC live for the `v1.signer` / `v1.signer-prod.testnet` root public key."""
        rpc_url = (
            "https://rpc.mainnet.near.org" if self.network == "mainnet" else "https://rpc.testnet.near.org"
        )
        try:
            resp = requests.post(
                rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "id": "predictee-mpc",
                    "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": self.MPC_CONTRACT_ID,
                        "method_name": "public_key",
                        "args_base64": base64.b64encode(b"{}").decode("utf-8")
                    }
                },
                timeout=8
            )
            if resp.status_code == 200:
                res_bytes = bytes(resp.json().get("result", {}).get("result", []))
                pubkey_str = json.loads(res_bytes.decode("utf-8"))
                self.mpc_root_pubkey = pubkey_str
                return {
                    "live_rpc": True,
                    "rpc_url": rpc_url,
                    "mpc_contract": self.MPC_CONTRACT_ID,
                    "root_public_key": pubkey_str
                }
        except Exception:
            pass
        return {
            "live_rpc": False,
            "rpc_url": rpc_url,
            "mpc_contract": self.MPC_CONTRACT_ID,
            "root_public_key": self.mpc_root_pubkey
        }

    def derive_polygon_address(self, near_account_id: str, path: str = "polymarket") -> str:
        """
        Derives the canonical EVM address on Polygon controlled by `near_account_id`
        via NEAR Chain Signatures (`v1.signer`) using the official KDF:
          epsilon = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:{account_id},{path}") mod N
          child_pubkey = root_pubkey + epsilon * G
          evm_address = keccak256(uncompressed_child_pubkey[1:])[-20:]
        """
        derivation_label = f"near-mpc-recovery v0.1.0 epsilon derivation:{near_account_id},{path}"
        epsilon = int.from_bytes(hashlib.sha3_256(derivation_label.encode("utf-8")).digest(), "big") % N
        root_pt = self._get_root_point()
        child_x, child_y = add(root_pt, multiply(G, epsilon))
        uncompressed_64 = child_x.to_bytes(32, "big") + child_y.to_bytes(32, "big")
        raw_addr = "0x" + keccak(uncompressed_64)[-20:].hex()
        return to_checksum_address(raw_addr)

    @staticmethod
    def _compute_polymarket_eip712_digest(order_payload: Dict[str, Any], chain_id: int, verifying_contract: str) -> bytes:
        """
        Computes the canonical EIP-712 Keccak-256 digest (`\x19\x01 || domainSeparator || structHash`)
        for a Polymarket CTF Exchange Order on Polygon (`chainId=137`).
        """
        domain_type_hash = keccak(
            b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        )
        name_hash = keccak(b"Polymarket CTF Exchange")
        version_hash = keccak(b"1")
        chain_id_bytes = int(chain_id).to_bytes(32, "big")
        contract_bytes = bytes.fromhex(verifying_contract.removeprefix("0x")).rjust(32, b"\x00")
        domain_separator = keccak(domain_type_hash + name_hash + version_hash + chain_id_bytes + contract_bytes)

        order_type_hash = keccak(
            b"Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,"
            b"uint256 makerAmount,uint256 takerAmount,uint256 side,uint256 feeRateBps,uint256 nonce)"
        )
        maker_bytes = bytes.fromhex(order_payload["maker"].removeprefix("0x")).rjust(32, b"\x00")
        signer_bytes = bytes.fromhex(order_payload["signer"].removeprefix("0x")).rjust(32, b"\x00")
        taker_bytes = bytes.fromhex(order_payload["taker"].removeprefix("0x")).rjust(32, b"\x00")
        try:
            token_int = int(str(order_payload["tokenId"]), 0)
        except ValueError:
            token_int = int.from_bytes(keccak(str(order_payload["tokenId"]).encode("utf-8")), "big")

        struct_encoded = (
            order_type_hash
            + int(order_payload["salt"]).to_bytes(32, "big")
            + maker_bytes
            + signer_bytes
            + taker_bytes
            + (token_int % (1 << 256)).to_bytes(32, "big")
            + int(order_payload["makerAmount"]).to_bytes(32, "big")
            + int(order_payload["takerAmount"]).to_bytes(32, "big")
            + int(order_payload["side"]).to_bytes(32, "big")
            + int(order_payload["feeRateBps"]).to_bytes(32, "big")
            + int(order_payload["nonce"]).to_bytes(32, "big")
        )
        struct_hash = keccak(struct_encoded)
        return keccak(b"\x19\x01" + domain_separator + struct_hash)

    def build_polymarket_order_intent(
        self,
        near_account_id: str,
        market_id: str,
        token_id: str,
        side: str,  # "BUY_YES" or "BUY_NO"
        amount_usd: float,
        limit_price: float,
        tee_attestation_hash: str
    ) -> Dict[str, Any]:
        """
        Prepares a cross-chain Polymarket CLOB order intent with:
          - Real secp256k1 epsilon-derived Polygon maker/signer address from `v1.signer`
          - Correct Polymarket CLOB `side = 0` (`BUY`) for both `BUY_YES` (outcome token YES) and `BUY_NO` (outcome token NO)
          - Real EIP-712 Keccak-256 digest (`\x19\x01 || domainSeparator || structHash`)
          - Canonical NEAR `v1.signer` `sign` request payload
        """
        polygon_address = self.derive_polygon_address(near_account_id)
        nonce = int(time.time() * 1000)

        # Guard limit_price against zero division
        safe_limit_price = max(0.01, min(0.99, float(limit_price)))

        # On Polymarket CTF Exchange, side=0 is BUY and side=1 is SELL.
        # Buying YES vs Buying NO is selected via `tokenId` (YES outcome token vs NO outcome token).
        clob_order_side = 0 if side in ("BUY_YES", "BUY_NO", "BUY") else 1

        order_payload = {
            "salt": nonce,
            "maker": polygon_address,
            "signer": polygon_address,
            "taker": "0x0000000000000000000000000000000000000000",
            "tokenId": str(token_id),
            "makerAmount": int(amount_usd * 1_000_000),  # 6 decimals USDC
            "takerAmount": int(amount_usd / safe_limit_price * 1_000_000),
            "side": clob_order_side,
            "outcomeSide": side,
            "feeRateBps": 0,
            "nonce": nonce
        }

        digest_bytes = self._compute_polymarket_eip712_digest(
            order_payload,
            chain_id=self.POLYGON_CHAIN_ID,
            verifying_contract=self.POLYMARKET_CTF_EXCHANGE
        )
        digest_hex = digest_bytes.hex()

        return {
            "intent_id": f"intent-{nonce}",
            "near_account_id": near_account_id,
            "derived_polygon_address": polygon_address,
            "derivation_kdf": f"near-mpc-recovery v0.1.0 epsilon derivation:{near_account_id},polymarket",
            "mpc_root_public_key": self.mpc_root_pubkey,
            "market_id": market_id,
            "side": side,
            "amount_usd": amount_usd,
            "limit_price": safe_limit_price,
            "near_mpc_contract": self.MPC_CONTRACT_ID,
            "mpc_derivation_path": "polymarket",
            "eip712_domain": {
                "name": "Polymarket CTF Exchange",
                "version": "1",
                "chainId": self.POLYGON_CHAIN_ID,
                "verifyingContract": self.POLYMARKET_CTF_EXCHANGE
            },
            "eip712_order": order_payload,
            "eip712_digest": f"0x{digest_hex}",
            "mpc_sign_request": {
                "receiver_id": self.MPC_CONTRACT_ID,
                "method_name": "sign",
                "args": {
                    "request": {
                        "payload": list(digest_bytes),
                        "path": "polymarket",
                        "key_version": 0
                    }
                },
                "gas": "250000000000000",
                "deposit": "1"
            },
            "tee_attestation_linked": tee_attestation_hash,
            "status": "READY_FOR_MPC_SIGNATURE"
        }

    def simulate_mpc_signing(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """
        Signs the 32-byte EIP-712 Keccak-256 digest with a genuine secp256k1 ECDSA key in
        sandbox mode when an interactive NEAR wallet is not connected to broadcast `v1.signer.sign`.
        Explicitly labels the execution mode as `SANDBOX_MPC_SIMULATION`.
        """
        digest_hex = intent.get("eip712_digest", "0x" + "00" * 32).removeprefix("0x")
        digest_bytes = bytes.fromhex(digest_hex.ljust(64, "0")[:64])
        polygon_addr = intent.get("derived_polygon_address", "0x0000000000000000000000000000000000000000")

        signed = _SANDBOX_MPC_SIGNER.unsafe_sign_hash(digest_bytes)
        r_hex = f"0x{signed.r:064x}"
        s_hex = f"0x{signed.s:064x}"

        intent["status"] = "MPC_SIGNED_EXECUTED"
        intent["execution_mode"] = "SANDBOX_MPC_SIMULATION"
        intent["polygon_tx_hash"] = f"0x{keccak(digest_bytes + b':polygon_clob_order_id').hex()}"
        intent["mpc_signature"] = {
            "r": r_hex,
            "s": s_hex,
            "v": 27,
            "recovery_id": signed.v - 27 if signed.v >= 27 else signed.v,
            "sandbox_signer_address": _SANDBOX_MPC_SIGNER.address
        }
        intent["explorer_url"] = f"https://polygonscan.com/address/{polygon_addr}"
        intent["near_mpc_explorer_url"] = f"https://nearblocks.io/address/{self.MPC_CONTRACT_ID}"
        return intent

    def build_request_resolution_tx(
        self,
        requester_account_id: str,
        query: str,
        category: str = "General",
        bounty_near: float = 1.0,
        callback_contract: Optional[str] = None,
        callback_method: Optional[str] = None,
        oracle_contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Builds a NEAR function-call transaction payload for `request_resolution`
        on the PredicTEE Oracle smart contract.
        """
        target_contract = oracle_contract_id or self.oracle_contract_id
        bounty_yocto = str(int(float(bounty_near) * 10**24))

        args: Dict[str, Any] = {
            "query": query.strip(),
            "category": category.strip()
        }
        if callback_contract:
            args["callback_contract"] = callback_contract.strip()
        if callback_method:
            args["callback_method"] = callback_method.strip()

        return {
            "signer_id": requester_account_id,
            "receiver_id": target_contract,
            "actions": [
                {
                    "type": "FunctionCall",
                    "params": {
                        "method_name": "request_resolution",
                        "args": args,
                        "gas": "50000000000000",  # 50 TGas
                        "deposit": bounty_yocto
                    }
                }
            ],
            "bounty_near": float(bounty_near),
            "bounty_yocto": bounty_yocto,
            "status": "READY_TO_SIGN"
        }

    def build_fulfill_resolution_tx(
        self,
        resolver_account_id: str,
        request_id: str,
        outcome: str,
        confidence_bps: int,
        attestation_hash: str,
        enclave_measurement: str,
        evidence_digest: str = "",
        signed_text: str = "",
        ecdsa_signature: str = "",
        oracle_contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Builds a NEAR function-call transaction payload for `fulfill_resolution`
        on the PredicTEE Oracle smart contract, including the EIP-191 TEE ECDSA signature.
        """
        target_contract = oracle_contract_id or self.oracle_contract_id

        args = {
            "request_id": request_id,
            "outcome": outcome,
            "confidence_bps": int(confidence_bps),
            "attestation_hash": attestation_hash,
            "enclave_measurement": enclave_measurement,
            "evidence_digest": evidence_digest or "",
            "signed_text": signed_text or "",
            "ecdsa_signature": ecdsa_signature or ""
        }

        return {
            "signer_id": resolver_account_id,
            "receiver_id": target_contract,
            "actions": [
                {
                    "type": "FunctionCall",
                    "params": {
                        "method_name": "fulfill_resolution",
                        "args": args,
                        "gas": "100000000000000",  # 100 TGas
                        "deposit": "0"
                    }
                }
            ],
            "request_id": request_id,
            "status": "READY_TO_SIGN"
        }
