const net = require('net');
const exec = require('child_process').execSync;

const socket_port = 3000;
const socket_token = "SOCKET_TOKEN";
const allowed_ips = ['1.1.1.1'];

const server = net.createServer((socket) => {

    const remoteAddress = socket.remoteAddress.replace(/^.*:/, '');
    if (!allowed_ips.includes(remoteAddress)) {
        console.log(`Connection from ${remoteAddress} not allowed`);
        socket.write('failed');
        socket.end();
        return;
    }
  
    socket.on('data', (data) => {
        try {
            const json = JSON.parse(Buffer.from(data.toString(), 'base64').toString());

            if (json.socket_token !== socket_token) {
                socket.write('failed');
                socket.end();
            }

            //launch attack
            exec(json.command, function (error, stdout, stderr) {});

            console.log(`started attack on ${json.host}`)
        
            socket.write('success');
        } catch (e) {
            console.log(`failed to start a attack ${e}`)
        
            socket.write('failed');
            socket.end();
        }
    });

    socket.on('error', (err) => { });

    socket.on('close', () => { });
});

server.listen(socket_port, () => {
    console.log(`Server listening on ${socket_port}`);
});
