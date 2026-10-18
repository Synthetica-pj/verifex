import requests
import json

url = "http://localhost:8501/api/signup"
data = {
    "userId": "test_user_456",
    "name": "Test User 2",
    "email": "test2@example.com",
    "password": "password123"
}

try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Error: {e}")
