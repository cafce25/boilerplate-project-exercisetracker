require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const body_parser = require('body-parser');
const https = require('https');

const mongoose = require('mongoose');
const { Schema } = mongoose;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true});

const userSchema = new Schema({
  username: { type: String, unique: true, required: true },
});

const exerciseSchema = new Schema({
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

let User = mongoose.model('User', userSchema);
let Exercise = mongoose.model('Exercise', exerciseSchema);

async function createAndSaveUser(user_name) {
  const existing_user = await findUserByName(user_name);
  if (existing_user) {
    throw "User already exists";
  }
  const user = new User({
    username: user_name,
  });
  return user.save();
}

async function findUserByName(user_name) {
  return User.findOne({username: user_name});
}

async function createAndSaveExercise(user_id, description, duration, date) {
  const user = await User.findById(user_id);
  if (!user) {
    throw "Invalid user id";
  }

  const exercise = new Exercise();

  exercise.description = description;
  exercise.duration = duration;
  exercise.date = date;
  exercise.user_id = user_id;

  await exercise.save();
  user.log.push(exercise._id);
  user.count = user.log.length;
  await user.save();
  return exercise;
}

app.use(cors())
app.use(body_parser.urlencoded({extended: false}));
app.use(express.static('public'))
app.get('/', (_req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

function createUserRoute(req, res) {
  createAndSaveUser(req.body.username).then((user) => {
    res.json(user);
  }, (err) => {
    console.log(err);
    res.json({ error: err });
  });
}
app.post('/api/users', createUserRoute);
app.post('/api/exercise/new-user', createUserRoute);

app.get('/api/users', function(req, res) {
  User.find().then((users) => {
    res.json(users);
  }, (err) => {
    console.log(err);
    res.json({ error: err });
  });
});

function addExerciseRoute(req, res) {
  https.get(
    'https://fcc-jb-timestamps.herokuapp.com/api/' + req.body.date,
    date_res => {
      date_res.on('data', (date) => {
        date = new Date(JSON.parse(date).unix);
        createAndSaveExercise(
          req.body.userId || req.params._id,
          req.body.description,
          req.body.duration,
          date
        ).then((exercise) => {
          res.json(exercise);
        }, (err) => {
          console.log(err);
          res.json({ error: err });
        });
      });
    });
}
app.post('/api/users/:_id/exercises',  addExerciseRoute);
app.post('/api/exercise/add', addExerciseRoute);

app.get('/api/users/:_id/logs', (req, res) => {
  let date_filter = {};
  if (req.query.from) {
    date_filter['$gte'] = new Date(req.query.from);
  }
  if (req.query.to) {
    date_filter['$lte'] = new Date(req.query.to);
  }
  User.
    findById(req.params._id).
    then((user) => {
      let user_obj = user.toObject();
      let query = Exercise.find({
        user_id: user_obj._id,
        date: date_filter,
      });
      if (req.query.limit) {
        query = query.limit(parseInt(req.query.limit))
      }
      query.exec((err, log) => {
        if (err) {
          console.log(err);
          res.json({ error: err });
        } else {
          user_obj.count = log.length;
          user_obj.log = log;
          res.json(user_obj)
        }
      });
    }, err => {
      console.log(err);
      res.json({ error: err });
    });
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
