from convex import ConvexClient
import os
from pathlib import Path

env_local_path = Path(".env.local")
url = ""
if env_local_path.exists():
    for line in env_local_path.read_text().splitlines():
        if line.startswith("CONVEX_URL="):
            url = line.split("=", 1)[1].strip().strip("'\"")
            break

print(f"Testing Convex URL: {url}")
if not url:
    print("Error: CONVEX_URL not found in .env.local")
    exit(1)

try:
    client = ConvexClient(url)
    # Just try a simple query
    history = client.query("scans:getHistory", {"userId": "test"})
    print("Successfully connected to Convex!")
    print(f"History sample: {history[:1]}")
except Exception as e:
    print(f"Failed to connect to Convex: {e}")
