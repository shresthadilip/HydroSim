# HydroSim 3D: Complete Production Deployment Guide

This guide provides step-by-step instructions for deploying and maintaining the **HydroSim 3D** full-stack architecture:
- **Frontend**: Hosted on **Vercel** (`https://hydrosim-three.vercel.app`)
- **Backend API**: Hosted on **Ubuntu VPS** (`https://hydrosim.nepxiv.com/api/v1`) via **systemd**, **Uvicorn** (Port `8001`), **Nginx** reverse proxy, and **Certbot SSL**.
- **CI/CD**: Automated deployments via **GitHub Actions** (`.github/workflows/deploy.yml`).

---

## 1. Architecture Overview

```
[ User Browser ]
       │
       ├─────────────────────────────────┐
       ▼ (HTTPS)                         ▼ (HTTPS / WSS)
[ Vercel Frontend ]              [ Nginx Reverse Proxy ]
(hydrosim-three.vercel.app)      (hydrosim.nepxiv.com:443)
                                         │
                                         ▼ (Localhost Proxy)
                                 [ systemd / Uvicorn ]
                                 (127.0.0.1:8001)
                                         │
                                 [ FastAPI Simulation Engine ]
                                 (/var/www/HydroSim/backend)
```

---

## 2. DNS Configuration

Add an **`A` record** in your domain registrar / Cloudflare for your subdomain:
- **Type**: `A`
- **Name / Host**: `hydrosim` (for `hydrosim.nepxiv.com`)
- **Value / Target**: `YOUR_VPS_PUBLIC_IP`
- **TTL**: Auto / 300s

---

## 3. One-Time VPS Server Setup

SSH into your VPS as `root` (or sudo user) and execute the following steps:

### Step 3.1: Clone the Repository to `/var/www/HydroSim`
```bash
sudo mkdir -p /var/www/HydroSim
sudo chown -R $USER:$USER /var/www/HydroSim
git clone https://github.com/shresthadilip/HydroSim.git /var/www/HydroSim
```

### Step 3.2: Create Python Virtual Environment & Install Dependencies
```bash
cd /var/www/HydroSim/backend

# If uv is installed:
if command -v uv &> /dev/null; then
    uv sync
else
    # Standard Python venv
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install fastapi "uvicorn[standard]" pydantic shapely pyproj rasterio numpy pandas scipy
fi

# Verify uvicorn binary exists
ls -la /var/www/HydroSim/backend/.venv/bin/uvicorn
```

### Step 3.3: Create systemd Service Unit (Port 8001)
```bash
sudo tee /etc/systemd/system/hydrosim.service > /dev/null <<'EOF'
[Unit]
Description=HydroSim 3D FastAPI Backend
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/var/www/HydroSim/backend
EnvironmentFile=-/var/www/HydroSim/backend/.env
ExecStart=/var/www/HydroSim/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hydrosim
sudo systemctl restart hydrosim
sudo systemctl status hydrosim
```

### Step 3.4: Configure Nginx Reverse Proxy
```bash
sudo tee /etc/nginx/sites-available/hydrosim-backend.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name hydrosim.nepxiv.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;

        # Standard Proxy Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSockets & Streaming support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;

        # Timeouts for 3D hydraulic routing computations
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
    }
}
EOF
```

Enable configuration and reload Nginx:
```bash
sudo ln -sf /etc/nginx/sites-available/hydrosim-backend.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 3.5: Obtain Free SSL Certificate (Certbot)
```bash
sudo certbot --nginx -d hydrosim.nepxiv.com
```

Test API health in your terminal or browser:
```bash
curl https://hydrosim.nepxiv.com/api/v1/health
# Expected Output: {"status":"ok","service":"flood-simulation-api"}
```

---

## 4. GitHub Actions CI/CD Setup

Every push to `main` containing changes under `backend/**` automatically deploys the updated code and dependencies to your VPS.

### Configure GitHub Repository Secrets:
1. Open your repository on GitHub: `https://github.com/<username>/HydroSim`
2. Go to **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **New repository secret**.
3. Add the following secrets:

| Secret Name | Value | Example |
|---|---|---|
| `VPS_HOST` | Your VPS Public IP Address | `159.65.123.45` |
| `VPS_USERNAME` | SSH username | `root` (or `ubuntu`) |
| `VPS_SSH_KEY` | Private SSH key (starts with `-----BEGIN ...`) | Content of `~/.ssh/id_rsa` or `~/.ssh/id_ed25519` |
| `VPS_PORT` | SSH Port *(Optional)* | `22` |

---

## 5. Vercel Frontend Setup

To connect the Vercel frontend with the live VPS backend:

1. Open your **Vercel Dashboard** $\rightarrow$ select the **HydroSim** project.
2. Go to **Settings** $\rightarrow$ **Environment Variables**.
3. Add:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://hydrosim.nepxiv.com/api/v1`
4. Trigger a **Redeploy** on Vercel so the environment variable takes effect.

---

## 6. Maintenance & Useful Commands

### Backend Service Management
```bash
# Check service status
sudo systemctl status hydrosim

# Restart service manually
sudo systemctl restart hydrosim

# View real-time service logs
journalctl -u hydrosim -f

# View last 100 log lines
journalctl -u hydrosim -n 100 --no-pager
```

### Nginx Management
```bash
# Test Nginx configuration syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# View Nginx access & error logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Adding New Dependencies
Add the package to `backend/pyproject.toml` under `dependencies = [...]`, commit, and push to GitHub:
```bash
git add backend/pyproject.toml
git commit -m "feat: add new dependency"
git push origin main
```
GitHub Actions will automatically install the package in `.venv` and restart the backend service on your VPS.
