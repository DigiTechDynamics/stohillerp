import subprocess
import os

backend_path = r"c:\Users\mkavh\Desktop\Digital Tech Dynamics\Clients\2026\Stohil\erp-master\stohillerp-master\backend"
python_exe = os.path.join(backend_path, "venv", "Scripts", "python.exe")

with open("test_output_final.txt", "w", encoding="utf-8") as f:
    try:
        result = subprocess.run(
            [python_exe, "manage.py", "test", "apps.rentals", "-v", "2"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            cwd=backend_path
        )
        f.write("STDOUT:\n")
        f.write(result.stdout)
        f.write("\nSTDERR:\n")
        f.write(result.stderr)
        f.write(f"\nEXIT CODE: {result.returncode}\n")
    except Exception as e:
        f.write(f"ERROR: {e}\n")
