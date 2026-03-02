# Waitlist — EC2 + RDS MySQL Setup Guide

## Architecture
```
Browser (index.html) → EC2 (Node.js/Express) → AWS RDS (MySQL)
```

---

## 1. Create an AWS RDS MySQL Instance

1. Go to **AWS Console → RDS → Create database**
2. Choose **MySQL**, Free tier is fine for a waitlist
3. Set a **DB name**, **master username**, and **password** — save these
4. Under **Connectivity**, set "Public access" to **No** (EC2 will connect privately)
5. Create the database and note the **endpoint URL** (e.g. `mydb.xxxxx.rds.amazonaws.com`)

---

## 2. Launch an EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Choose **Ubuntu 22.04 LTS**, `t2.micro` (free tier)
3. Create or select a key pair — download the `.pem` file
4. Under **Security Group**, add inbound rules:
   - **SSH**: Port 22 from your IP
   - **Custom TCP**: Port 3000 from anywhere (or your frontend's IP)
5. Launch the instance and note its **Public IPv4 address**

---

## 3. Update the RDS Security Group

The RDS instance must allow connections from your EC2 instance:

1. Go to **RDS → your database → Connectivity & security → VPC security group**
2. Edit inbound rules → Add rule:
   - **Type**: MySQL/Aurora
   - **Port**: 3306
   - **Source**: The security group of your EC2 instance

---

## 4. SSH into EC2 and Set Up the Server

```bash
# SSH in
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (keeps the server running)
sudo npm install -g pm2

# Clone or upload your backend files, then:
cd /home/ubuntu/backend
npm install

# Set up environment variables
cp .env.example .env
nano .env
# Fill in your DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, ADMIN_SECRET
```

---

## 5. Start the Server

```bash
# Start with PM2
pm2 start server.js --name waitlist-api

# Auto-restart on reboot
pm2 startup
pm2 save

# Check logs
pm2 logs waitlist-api
```

---

## 6. Update the Frontend

In `index.html`, update these two lines at the top of the `<script>`:

```javascript
const API_URL      = "http://YOUR_EC2_PUBLIC_IP:3000";
const ADMIN_SECRET = "change_this_to_a_long_random_secret_string"; // Must match server .env ADMIN_SECRET
```

---

## 7. (Optional but Recommended) Use a Domain + HTTPS

If you have a domain:
1. Point it to your EC2 IP via an **A record**
2. Install **Nginx** as a reverse proxy on port 80/443
3. Use **Certbot** for a free SSL certificate:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```
4. Update `API_URL` in the frontend to `https://yourdomain.com`

---

## File Structure

```
backend/
  server.js        ← Express API
  package.json
  .env.example     ← Copy to .env and fill in your values
  .env             ← Never commit this!

frontend/
  index.html       ← The waitlist page (update API_URL inside)
```

---

## Security Checklist

- [ ] `ADMIN_SECRET` is a long random string (not the default)
- [ ] `ADMIN_UI_PASSWORD` in index.html is changed
- [ ] `.env` is never committed to Git (add to `.gitignore`)
- [ ] RDS is not publicly accessible (only EC2 can reach it)
- [ ] EC2 Security Group only allows port 3000 from necessary IPs
- [ ] HTTPS is set up if using a custom domain
