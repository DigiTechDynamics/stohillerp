import urllib.request
import urllib.error

try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/v1/dashboard/executive/') as response:
        html = response.read().decode('utf-8')
        print(f"Status Code: {response.status}")
except urllib.error.HTTPError as e:
    print(f"Status Code: {e.code}")
    html = e.read().decode('utf-8')
except Exception as e:
    print(f"Failed to connect: {e}")
    html = ""

if html:
    with open('error_traceback.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Response saved to error_traceback.html")
