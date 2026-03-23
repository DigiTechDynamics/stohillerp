import requests

def test_dashboard():
    # Login as admin
    login_res = requests.post('http://127.0.0.1:8000/api/v1/auth/login/', json={
        'email': 'admin@stohill.co.za',
        'password': 'admin' # Assuming standard default password, but just in case we can use ceo@
    })
    
    if login_res.status_code != 200:
        # try ceo
        login_res = requests.post('http://127.0.0.1:8000/api/v1/auth/login/', json={
            'email': 'ceo@stohill.co.za',
            'password': 'admin'
        })
        if login_res.status_code != 200:
            print(f"Login failed: {login_res.status_code} {login_res.text}")
            # Try to get password from DB or create a test token
            return
            
    token = login_res.json()['access']
    print("Logged in!")
    
    res = requests.get('http://127.0.0.1:8000/api/v1/dashboard/executive/', headers={
        'Authorization': f'Bearer {token}'
    })
    
    print(f"Dashboard status: {res.status_code}")
    if res.status_code >= 400:
        print(res.text)

if __name__ == '__main__':
    test_dashboard()
