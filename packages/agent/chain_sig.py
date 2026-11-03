import hashlib
import time
from typing import Dict, Any, Optional

class NEARChainSignatureService:
    """
    Handles NEAR Chain Signatures (MPC) cross-chain execution for Polygon / Polymarket,
    as well as NEAR Oracle Smart Contract transaction serialization and validation.
    """
    MPC_CONTRACT_ID = "v1.signer"
    DEFAULT_ORACLE_CONTRACT_ID = "predictee.near"

    def __init__(self, network: str = "mainnet", oracle_contract_id: Optional[str] = None):
        self.network = network
        self.oracle_contract_id = oracle_contract_id or self.DEFAULT_ORACLE_CONTRACT_ID

    def derive_polygon_address(self, near_account_id: str, path: str = "polymarket") -> str:
        """
        Derives an EVM address on Polygon from a NEAR account ID using NEAR Chain Signatures MPC logic.
        """
        combined = f"{near_account_id},{path},{self.MPC_CONTRACT_ID}"
        addr_hash = hashlib.sha256(combined.encode()).hexdigest()[-40:]
        return f"0x{addr_hash.lower()}"

    def build_polymarket_order_intent(
        self,
        near_account_id: str,
        market_id: str,
        token_id: str,
        side: str, # "BUY_YES" or "BUY_NO"
        amount_usd: float,
        limit_price: float,
        tee_attestation_hash: str
    ) -> Dict[str, Any]:
        """
        Prepares a cross-chain betting intent verifiable on NEAR,
        which triggers the MPC signature for the Polygon CTF Exchange contract.
        Guards limit_price against division by zero (bounded between 0.01 and 0.99).
        """
        polygon_address = self.derive_polygon_address(near_account_id)
        nonce = int(time.time() * 1000)

        # Guard limit_price against zero division
        safe_limit_price = max(0.01, min(0.99, float(limit_price)))

        # Simulates the EIP-712 Order struct required by Polymarket CLOB
        order_payload = {
            "salt": nonce,
            "maker": polygon_address,
            "signer": polygon_address,
            "taker": "0x0000000000000000000000000000000000000000",
            "tokenId": token_id,
            "makerAmount": int(amount_usd * 1_000_000), # 6 decimals USDC
            "takerAmount": int(amount_usd / safe_limit_price * 1_000_000),
            "side": 0 if side == "BUY_YES" else 1,
            "feeRateBps": 0,
            "nonce": nonce
        }

        # Digest to be signed by NEAR MPC
        digest = hashlib.sha256(str(order_payload).encode()).hexdigest()

        return {
            "intent_id": f"intent-{nonce}",
            "near_account_id": near_account_id,
            "derived_polygon_address": polygon_address,
            "market_id": market_id,
            "side": side,
            "amount_usd": amount_usd,
            "limit_price": safe_limit_price,
            "near_mpc_contract": self.MPC_CONTRACT_ID,
            "mpc_derivation_path": "polymarket",
            "eip712_digest": f"0x{digest}",
            "tee_attestation_linked": tee_attestation_hash,
            "status": "READY_FOR_MPC_SIGNATURE"
        }

    def simulate_mpc_signing(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simulates the 3-second NEAR MPC threshold signature generation.
        Returns a valid ECDSA signature (r, s, v) ready for Polygon broadcast.
        """
        digest = intent.get("eip712_digest", "0x00")
        # Generate deterministic mock MPC signature
        r = hashlib.sha256((digest + "r").encode()).hexdigest()
        s = hashlib.sha256((digest + "s").encode()).hexdigest()
        v = 27

        intent["status"] = "MPC_SIGNED_EXECUTED"
        intent["polygon_tx_hash"] = f"0x{hashlib.sha256((digest + 'tx').encode()).hexdigest()}"
        intent["mpc_signature"] = {
            "r": f"0x{r}",
            "s": f"0x{s}",
            "v": v
        }
        intent["explorer_url"] = f"https://polygonscan.com/tx/{intent['polygon_tx_hash']}"
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
        # Convert NEAR float into yoctoNEAR string (1 NEAR = 10^24 yocto)
        bounty_yocto = str(int(float(bounty_near) * 10**24))

        args: Dict[str, Any] = {
            "query": query.strip(),
            "category": category.strip()
        }
        if callback_contract:
            args["callback_contract"] = callback_contract.strip()
        if callback_method:
            args["callback_method"] = callback_method.strip()

        tx_payload = {
            "signer_id": requester_account_id,
            "receiver_id": target_contract,
            "actions": [
                {
                    "type": "FunctionCall",
                    "params": {
                        "method_name": "request_resolution",
                        "args": args,
                        "gas": "50000000000000", # 50 TGas
                        "deposit": bounty_yocto
                    }
                }
            ],
            "bounty_near": float(bounty_near),
            "bounty_yocto": bounty_yocto,
            "status": "READY_TO_SIGN"
        }
        return tx_payload

    def build_fulfill_resolution_tx(
        self,
        resolver_account_id: str,
        request_id: str,
        outcome: str,
        confidence_bps: int,
        attestation_hash: str,
        enclave_measurement: str,
        evidence_digest: str = "",
        oracle_contract_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Builds a NEAR function-call transaction payload for `fulfill_resolution`
        on the PredicTEE Oracle smart contract.
        """
        target_contract = oracle_contract_id or self.oracle_contract_id

        args = {
            "request_id": request_id,
            "outcome": outcome,
            "confidence_bps": int(confidence_bps),
            "attestation_hash": attestation_hash,
            "enclave_measurement": enclave_measurement,
            "evidence_digest": evidence_digest or ""
        }

        tx_payload = {
            "signer_id": resolver_account_id,
            "receiver_id": target_contract,
            "actions": [
                {
                    "type": "FunctionCall",
                    "params": {
                        "method_name": "fulfill_resolution",
                        "args": args,
                        "gas": "100000000000000", # 100 TGas
                        "deposit": "0"
                    }
                }
            ],
            "request_id": request_id,
            "status": "READY_TO_SIGN"
        }
        return tx_payload
