"""
Predictee TEE Node Operator CLI
===============================
Dedicated terminal console for Predictee Oracle node operators and relayers.
Allows inspecting TEE enclave status, hot-switching confidential AI models,
safely rotating API keys in .env, and testing enclave inference directly
from the operator's secure server terminal without exposing any admin controls
to public dApp frontend visitors.

Usage:
    python packages/agent/operator.py              # Interactive management menu
    python packages/agent/operator.py status       # Print current node & TEE status
    python packages/agent/operator.py model <name> # Switch active AI model
    python packages/agent/operator.py key <key>    # Rotate server API key in .env
    python packages/agent/operator.py test         # Run test confidential inference
"""

import sys
import os
import re
import argparse
import urllib.request
import urllib.error
import json
from pathlib import Path

# Find repo root and .env path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_PATH = REPO_ROOT / ".env"
API_BASE = os.getenv("PREDICTEE_AGENT_URL", "http://127.0.0.1:8000")
ADMIN_TOKEN = os.getenv("PREDICTEE_ADMIN_TOKEN", "admin123")

# Available NEAR AI Cloud Confidential Models
SUPPORTED_MODELS = [
    ("z-ai/glm-5.3-flash", "GLM-5.3 Flash (Default - Fast & High-Throughput TEE)"),
    ("Qwen/Qwen3.8-27B", "Qwen 3.8 27B (High-Precision Deep Reasoning)"),
    ("Qwen/Qwen3.6-35B-A3B", "Qwen 3.6 35B (Complex Multilingual Analysis)"),
    ("deepseek-ai/DeepSeek-V3", "DeepSeek V3 (Alternative Open Weights)"),
]

def print_banner():
    banner = r"""
========================================================================
   ____             ___      __            ____                       __            
  / __ \________ __/ (_)____/ /____ ___   / __ \____  ___  _________ _/ /_____  _____
 / /_/ / ___/ _ \/ _  / / ___/ __/ _ \ / / /_/ / __ \/ _ \/ ___/ __ `/ __/ __ \/ ___/
/ ____/ /  /  __/ /_/ / / /__/ /_/  __/ / ____/ /_/ /  __/ /  / /_/ / /_/ /_/ / /    
\/   /_/   \___/\__,_/_/\___/\__/\___/ /_/    \____/\___/_/   \__,_/\__/\____/_/     
           PREDICTEE TEE NODE OPERATOR & RELAYER TERMINAL
========================================================================
"""
    print(banner)

def get_current_env_values():
    """Read values from .env without exposing plaintext secrets in logs."""
    model = "z-ai/glm-5.3-flash"
    has_key = False
    key_prefix = ""
    admin_token = "admin123"

    if ENV_PATH.exists():
        try:
            content = ENV_PATH.read_text(encoding="utf-8")
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k == "NEAR_AI_MODEL" and v:
                    model = v
                elif k == "NEAR_AI_API_KEY" and v:
                    has_key = True
                    key_prefix = v[:8] + "..." + v[-4:] if len(v) > 12 else "***configured***"
                elif k == "PREDICTEE_ADMIN_TOKEN" and v:
                    admin_token = v
        except Exception as e:
            pass
    return {
        "model": model,
        "has_key": has_key,
        "key_prefix": key_prefix,
        "admin_token": admin_token,
        "env_path": str(ENV_PATH)
    }

def update_env_variable(key: str, value: str):
    """Safely updates or appends an environment variable to the root .env file."""
    if not ENV_PATH.exists():
        ENV_PATH.write_text(f"{key}={value}\n", encoding="utf-8")
        return True

    content = ENV_PATH.read_text(encoding="utf-8")
    pattern = rf"^{re.escape(key)}=.*$"
    
    if re.search(pattern, content, flags=re.MULTILINE):
        new_content = re.sub(pattern, f"{key}={value}", content, flags=re.MULTILINE)
    else:
        new_content = content.rstrip() + f"\n{key}={value}\n"
    
    ENV_PATH.write_text(new_content, encoding="utf-8")
    return True

def query_agent_api(endpoint: str, method="GET", payload=None):
    """Sends authenticated request to local agent backend."""
    url = f"{API_BASE}{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "X-Admin-Token": ADMIN_TOKEN
    }
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        return {"error": str(e), "offline": True}
    except Exception as e:
        return {"error": str(e)}

def cmd_status():
    """Displays operator node status, active hardware enclaves, and model routing."""
    env_info = get_current_env_values()
    print("\n--- [1] NODE ENVIRONMENT (.env) ---")
    print(f"  Configuration File:   {env_info['env_path']}")
    print(f"  Configured Model:     \033[92m{env_info['model']}\033[0m")
    key_status = f"\033[92mConfigured ({env_info['key_prefix']})\033[0m" if env_info['has_key'] else "\033[93mNot Configured (Will fallback to simulated TEE seed)\033[0m"
    print(f"  NEAR AI Cloud API Key: {key_status}")

    print("\n--- [2] RUNNING AGENT BACKEND API ---")
    status_resp = query_agent_api("/api/status")
    if status_resp.get("offline"):
        print(f"  Backend Status:       \033[93mOffline (Agent not running at {API_BASE})\033[0m")
        print("  Notice: CLI modifications to .env will take effect on next server start.")
    else:
        print(f"  Backend Status:       \033[92mOnline (Running on {API_BASE})\033[0m")
        print(f"  Live Active Model:    \033[96m{status_resp.get('active_model')}\033[0m")
        print(f"  Verification Mode:    \033[95m{status_resp.get('verification_mode')}\033[0m")
        print(f"  MPC Relayer Address:  \033[94m{status_resp.get('mpc_relayer_address')}\033[0m")
        print(f"  Total Enclaves:       {status_resp.get('registered_enclaves_count', 0)}")
        print(f"  Resolved Inquiries:   {status_resp.get('total_resolutions_generated', 0)}")
    print("")

def cmd_set_model(model_name: str):
    """Switches the active confidential AI model."""
    valid_names = [m[0] for m in SUPPORTED_MODELS]
    if model_name not in valid_names:
        print(f"\n[!] Invalid model name '{model_name}'.")
        print("Supported confidential models:")
        for name, desc in SUPPORTED_MODELS:
            print(f"  - {name} ({desc})")
        return False

    # 1. Update .env
    update_env_variable("NEAR_AI_MODEL", model_name)
    print(f"\n[+] Updated .env: NEAR_AI_MODEL = {model_name}")

    # 2. Hot-update running agent if online
    api_resp = query_agent_api("/api/admin/model", method="POST", payload={"active_model": model_name})
    if not api_resp.get("offline") and not api_resp.get("error"):
        print(f"[+] Hot-reloaded running agent backend successfully! Active model is now \033[92m{model_name}\033[0m")
    else:
        print(f"[*] Agent backend is currently offline. Change saved to .env and will load on start.")
    return True

def cmd_set_key(api_key: str):
    """Safely updates NEAR_AI_API_KEY in .env without printing full key to screen."""
    clean_key = api_key.strip()
    if not clean_key:
        print("[!] Error: API key cannot be empty.")
        return False

    update_env_variable("NEAR_AI_API_KEY", clean_key)
    masked = clean_key[:8] + "..." + clean_key[-4:] if len(clean_key) > 12 else "***configured***"
    print(f"\n[+] Safely updated .env: NEAR_AI_API_KEY = {masked}")

    # Hot update agent if online
    env_info = get_current_env_values()
    api_resp = query_agent_api("/api/admin/model", method="POST", payload={
        "active_model": env_info["model"],
        "api_key": clean_key
    })
    if not api_resp.get("offline") and not api_resp.get("error"):
        print(f"[+] Hot-reloaded agent credentials. Live TEE mode active!")
    else:
        print(f"[*] Saved to .env. Will be loaded on next backend start.")
    return True

def cmd_test_inference():
    """Runs a live test confidential oracle resolution on the agent."""
    print("\n[*] Sending test confidential inference request to Predictee Enclave...")
    test_payload = {
        "title": "Operator Hardware Enclave Sanity Check: Test Query",
        "description": "Verification of Intel TDX quote generation and ECDSA attestation proof.",
        "category": "TECH",
        "resolution_criteria": "Resolve TRUE if Intel TDX hardware attestation succeeds."
    }

    resp = query_agent_api("/api/resolve", method="POST", payload=test_payload)
    if resp.get("offline") or resp.get("error"):
        print(f"\033[91m[!] Backend is not reachable: {resp.get('error')}\033[0m")
        print("Please start the backend first: python -m uvicorn packages.agent.agent:app --port 8000")
        return

    print("\n\033[92m[✓] CONFIDENTIAL INFERENCE COMPLETED SUCCESSFULLY!\033[0m")
    print(f"  Model Engine:     {resp.get('model_engine')}")
    print(f"  Hardware Type:    {resp.get('hardware_type')}")
    print(f"  Outcome:          {resp.get('outcome')}")
    print(f"  Confidence:       {resp.get('confidence')}%")
    print(f"  TEE Enclave Addr: {resp.get('enclave_address')}")
    print(f"  EIP-191 Signature:{resp.get('attestation_signature')[:24]}...")
    print(f"  Quote Length:     {len(resp.get('attestation_quote_b64', ''))} bytes")
    print(f"  Reasoning:        {resp.get('reasoning')[:120]}...\n")

def interactive_menu():
    """Runs an interactive CLI console when executed without flags."""
    print_banner()
    while True:
        env_info = get_current_env_values()
        print("\n---------------------------------------------------------")
        GREEN = "\033[92m"
        YELLOW = "\033[93m"
        RESET = "\033[0m"
        key_tag = f"{GREEN}Set{RESET}" if env_info['has_key'] else f"{YELLOW}Not Set{RESET}"
        model_tag = f"{GREEN}{env_info['model']}{RESET}"
        print(f" Active Model: {model_tag} | Key: {key_tag}")
        print("---------------------------------------------------------")
        print(" [1] View Node & Enclave Status")
        print(" [2] Switch Confidential AI Model")
        print(" [3] Rotate / Set NEAR AI API Key")
        print(" [4] Run Confidential Inference Test")
        print(" [5] Exit Operator Console")
        print("---------------------------------------------------------")
        choice = input("Select an option [1-5]: ").strip()

        if choice == "1":
            cmd_status()
        elif choice == "2":
            print("\nSelect Confidential AI Model:")
            for idx, (m_id, m_desc) in enumerate(SUPPORTED_MODELS, 1):
                marker = " [ACTIVE]" if m_id == env_info['model'] else ""
                print(f"   [{idx}] {m_id}{marker}\n       -> {m_desc}")
            sel = input(f"\nEnter choice [1-{len(SUPPORTED_MODELS)}] or model ID (Enter to cancel): ").strip()
            if sel.isdigit() and 1 <= int(sel) <= len(SUPPORTED_MODELS):
                cmd_set_model(SUPPORTED_MODELS[int(sel)-1][0])
            elif sel in [m[0] for m in SUPPORTED_MODELS]:
                cmd_set_model(sel)
            else:
                print("Cancelled.")
        elif choice == "3":
            new_key = input("\nEnter new NEAR AI API Key (input will not be logged): ").strip()
            if new_key:
                cmd_set_key(new_key)
            else:
                print("Cancelled.")
        elif choice == "4":
            cmd_test_inference()
        elif choice in ("5", "q", "exit"):
            print("\nExiting Operator CLI. Have a productive day!\n")
            sys.exit(0)
        else:
            print("[!] Invalid option. Please choose 1-5.")

def main():
    parser = argparse.ArgumentParser(description="Predictee TEE Node Operator CLI")
    subparsers = parser.add_subparsers(dest="command")

    # status
    subparsers.add_parser("status", help="Show current operator node & TEE status")

    # model
    model_parser = subparsers.add_parser("model", help="Switch active AI model")
    model_parser.add_argument("name", nargs="?", help="Model ID (e.g. z-ai/glm-5.3-flash, Qwen/Qwen3.8-27B)")

    # key
    key_parser = subparsers.add_parser("key", help="Rotate NEAR AI API key in .env")
    key_parser.add_argument("value", nargs="?", help="New API key")

    # test
    subparsers.add_parser("test", help="Execute test confidential oracle inference")

    args = parser.parse_args()

    if args.command == "status":
        cmd_status()
    elif args.command == "model":
        if args.name:
            cmd_set_model(args.name)
        else:
            print("Please specify model name, e.g.: python operator.py model z-ai/glm-5.3-flash")
    elif args.command == "key":
        if args.value:
            cmd_set_key(args.value)
        else:
            print("Please specify API key, e.g.: python operator.py key <your-key>")
    elif args.command == "test":
        cmd_test_inference()
    else:
        interactive_menu()

if __name__ == "__main__":
    main()
