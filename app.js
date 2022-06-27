const express = require('express')
const app = express();
const file = require('fs');
const io = require('nodejs-websocket');

//https://zhuanlan.zhihu.com/p/350593517
//https://www.jianshu.com/p/f0baf93a3795

const model = file.readFileSync().toString();

app.use('/pages',express.static('pages'));

app.get('/', function (req, res) {
   res.send('Hello World');
});

app.get('/about', function (req, res) {
  // res.sendFile( __dirname + "/pages/" + "about.html" );
  res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
  res.end("<html><head><title>aaaaa</title></head><body>bbbb</body></html>");
});

io.createServer(connection=>{
  let i=0;
	console.log('new connection...')
	connection.on("text",function(data){
    connection.sendText((i++)+":服务器端返回数据:"+data);
    connection.on("close", function (code, reason) {
        console.log("Connection closed")
    })
    connection.on("error",() => {
      console.log('服务异常关闭...')
    })
	});
}).listen(3000);

const server = app.listen(8081, ()=>{
  console.log("http://127.0.0.1:8081/");4
});
