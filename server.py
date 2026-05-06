import socket
import threading

HOST = '0.0.0.0'
PORT = 9090

clients = {}       # socket -> nickname
clients_lock = threading.Lock()

def broadcast(message: str, exclude=None):
    """Send a message to all connected clients except the excluded one."""
    dead = []
    with clients_lock:
        targets = list(clients.items())
    for conn, _ in targets:
        if conn is exclude:
            continue
        try:
            conn.sendall((message + "\n").encode())
        except OSError:
            dead.append(conn)
    for conn in dead:
        remove_client(conn)

def remove_client(conn):
    with clients_lock:
        nick = clients.pop(conn, None)
    if nick:
        conn.close()
        broadcast(f"*** {nick} has left the chat ***")
        print(f"[SERVER] {nick} disconnected.")

def handle_client(conn, addr):
    print(f"[SERVER] New connection from {addr}")
    try:
        # Ask for nickname
        conn.sendall(b"Enter your nickname: ")
        nick = conn.recv(64).decode().strip()
        if not nick:
            nick = f"User_{addr[1]}"

        with clients_lock:
            clients[conn] = nick

        conn.sendall(f"Welcome, {nick}! Type your messages below.\n".encode())
        broadcast(f"*** {nick} has joined the chat ***", exclude=conn)
        print(f"[SERVER] {nick} joined.")

        while True:
            data = conn.recv(1024)
            if not data:
                break
            message = data.decode().strip()
            if message:
                formatted = f"[{nick}]: {message}"
                print(formatted)
                broadcast(formatted, exclude=conn)

    except (ConnectionResetError, OSError):
        pass
    finally:
        remove_client(conn)

def start_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((HOST, PORT))
    server.listen(10)
    print(f"[SERVER] Listening on {HOST}:{PORT} ...")

    try:
        while True:
            conn, addr = server.accept()
            t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
            t.start()
    except KeyboardInterrupt:
        print("\n[SERVER] Shutting down.")
    finally:
        server.close()

if __name__ == "__main__":
    start_server()
