import socket
import threading
import sys

HOST = '127.0.0.1'
PORT = 9090

def receive_messages(conn):
    """Continuously listen for messages from the server and print them."""
    while True:
        try:
            data = conn.recv(1024)
            if not data:
                print("\n[Disconnected from server]")
                break
            print(data.decode(), end='', flush=True)
        except OSError:
            break

def start_client():
    conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        conn.connect((HOST, PORT))
    except ConnectionRefusedError:
        print(f"[ERROR] Could not connect to {HOST}:{PORT}. Is the server running?")
        sys.exit(1)

    # Start background thread to receive messages
    t = threading.Thread(target=receive_messages, args=(conn,), daemon=True)
    t.start()

    print(f"[CLIENT] Connected to {HOST}:{PORT}")

    try:
        while True:
            msg = input()
            if msg.lower() in ("/quit", "/exit"):
                print("[CLIENT] Disconnecting...")
                break
            if msg:
                conn.sendall((msg + "\n").encode())
    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        conn.close()

if __name__ == "__main__":
    start_client()
