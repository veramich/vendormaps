import express from 'express';

const app = express();

app.get('/hello/:name', function(req, res) {
  res.send('Hello, ' + req.params.name + '!');
});
app.use(express.json());

app.post('/hello', function(req, res) {
  res.send('Hello' + req.body.name + '!');
})

app.listen(8000, function() {
    console.log('Server is running on port 8000');
});
