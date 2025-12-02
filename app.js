// app.js
const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// BASIC APP SETUP
// =======================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Simple dev session (preview only – replace with secure settings + DB later)
app.use(
  session({
    secret: 'ella-rises-dev-secret',
    resave: false,
    saveUninitialized: false,
  })
);

// Flash-style helper using session
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  req.session.success = null;
  req.session.error = null;
  next();
});

// =======================
// IN-MEMORY DATA (PREVIEW ONLY)
// Shaped to roughly match the ERD relationships.
// =======================

// Users (preview only)
// password is plain text here ON PURPOSE for the preview.
// In the real app, replace with hashed passwords via bcrypt.
let users = [
  { id: 1, username: 'manager', password: 'manager123', role: 'manager' },
  { id: 2, username: 'user', password: 'user123', role: 'user' },
];

let nextUserId = 3;

// Participants
let participants = [
  {
    id: 1,
    email: 'ana.lopez@example.com',
    first_name: 'Ana',
    last_name: 'Lopez',
    dob: '2007-05-12',
    role: 'Participant',
    phone: '801-555-1001',
    city: 'Provo',
    state: 'UT',
    zip: '84604',
    school: 'Provo High School',
    field_of_interest: 'Engineering',
    grade: '10',
  },
  {
    id: 2,
    email: 'maria.ramirez@example.com',
    first_name: 'Maria',
    last_name: 'Ramirez',
    dob: '2006-09-23',
    role: 'Participant',
    phone: '801-555-1002',
    city: 'Orem',
    state: 'UT',
    zip: '84057',
    school: 'Orem High School',
    field_of_interest: 'Art & Design',
    grade: '11',
  },
];

let nextParticipantId = 3;

// Milestones catalog (Milestone table in ERD)
let milestones = [
  {
    id: 1,
    title: 'First STEAM Workshop Completed',
    description: 'Participant has completed their first STEAM workshop.',
  },
  {
    id: 2,
    title: 'College Application Submitted',
    description: 'Participant has submitted at least one college application.',
  },
  {
    id: 3,
    title: 'Declared STEAM Major',
    description: 'Participant has declared a STEAM-related major.',
  },
];

let nextMilestoneId = 4;

// ParticipantMilestone junction (ParticipantMilestone in ERD)
let participantMilestones = [
  { participant_id: 1, milestone_id: 1, milestone_date: '2024-03-15' },
  { participant_id: 1, milestone_id: 2, milestone_date: '2025-01-20' },
  { participant_id: 2, milestone_id: 1, milestone_date: '2024-04-10' },
];

// Events catalog (Event + simplified EventInstance)
let events = [
  {
    id: 1,
    name: 'STEAM Summit',
    type: 'Summit',
    description:
      'A full-day summit with workshops, mentoring circles, and keynote speakers.',
    location: 'BYU',
    start: new Date('2025-11-15T09:00:00'),
    end: new Date('2025-11-15T15:00:00'),
    capacity: 150,
  },
  {
    id: 2,
    name: 'Mariachi Workshop',
    type: 'Workshop',
    description:
      'Cultural music workshop that builds confidence through performance.',
    location: 'UVU',
    start: new Date('2025-12-03T18:00:00'),
    end: new Date('2025-12-03T20:00:00'),
    capacity: 60,
  },
];

let nextEventId = 3;

// Surveys (simplified Survey + core rating questions)
let surveys = [
  {
    id: 1,
    participant_id: 1,
    event_id: 1,
    submitted_at: new Date('2025-11-15T16:00:00'),
    satisfaction: 5,
    usefulness: 4,
    recommend: 5,
    comment: 'Loved meeting mentors in engineering!',
  },
  {
    id: 2,
    participant_id: 2,
    event_id: 2,
    submitted_at: new Date('2025-12-03T21:00:00'),
    satisfaction: 4,
    usefulness: 5,
    recommend: 5,
    comment: 'Mariachi workshop helped me feel more confident.',
  },
];

let nextSurveyId = 3;

// Donations (Donation table in ERD)
let donations = [
  {
    id: 1,
    participant_id: null, // anonymous / community donor
    donor_name: 'Community Donor',
    donor_email: 'donor@example.com',
    amount: 250,
    date: '2025-10-01',
    source: 'Website form',
  },
];

let nextDonationId = 2;

// =======================
// AUTH HELPERS
// =======================
function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.error = 'Please log in to access that page.';
    return res.redirect('/login');
  }
  next();
}

function requireManager(req, res, next) {
  if (!req.session.user) {
    req.session.error = 'Please log in to access that page.';
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'manager') {
    req.session.error = 'You must be a manager to do that.';
    return res.redirect('/dashboard');
  }
  next();
}

// Helper to format dates for the views
function formatDateShort(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =======================
// PUBLIC ROUTES
// =======================

app.get('/', (req, res) => {
  const upcomingEvents = events
    .slice()
    .sort((a, b) => a.start - b.start)
    .slice(0, 3)
    .map((e) => ({
      ...e,
      dateFormatted: formatDateShort(e.start),
    }));

  // Simple preview stats for the home page
  const impactStats = {
    participantsCount: participants.length,
    avgSatisfaction:
      surveys.length === 0
        ? null
        : (
            surveys.reduce((sum, s) => sum + (s.satisfaction || 0), 0) /
            surveys.length
          ).toFixed(1),
    avgRecommend:
      surveys.length === 0
        ? null
        : (
            surveys.reduce((sum, s) => sum + (s.recommend || 0), 0) /
            surveys.length
          ).toFixed(1),
    milestonesAchieved: participantMilestones.length,
  };

  res.render('public/home', { upcomingEvents, impactStats });
});


app.get('/programs', (req, res) => {
  res.render('public/programs');
});

app.get('/events', (req, res) => {
  const publicEvents = events.map((e) => ({
    name: e.name,
    type: e.type,
    location: e.location,
    dateFormatted: formatDateShort(e.start),
    description: e.description,
  }));
  res.render('public/events_public', { events: publicEvents });
});

app.get('/donate', (req, res) => {
  res.render('public/donate');
});

app.get('/impact', (req, res) => {
  const impactStats = {
    participantsCount: participants.length,
    avgSatisfaction:
      surveys.length === 0
        ? null
        : (
            surveys.reduce((sum, s) => sum + (s.satisfaction || 0), 0) /
            surveys.length
          ).toFixed(1),
    avgRecommend:
      surveys.length === 0
        ? null
        : (
            surveys.reduce((sum, s) => sum + (s.recommend || 0), 0) /
            surveys.length
          ).toFixed(1),
    milestonesAchieved: participantMilestones.length,
    totalDonations: donations.reduce(
      (sum, d) => sum + (Number(d.amount) || 0),
      0
    ),
  };

  res.render('public/impact', { impactStats });
});


// =======================
// AUTH ROUTES
// =======================

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    req.session.error = 'Invalid username or password.';
    return res.redirect('/login');
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  req.session.success = `Welcome, ${user.username}!`;
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// =======================
// DASHBOARD (READ-ONLY PREVIEW)
// =======================
app.get('/dashboard', requireLogin, (req, res) => {
  const totalParticipants = participants.length;
  const totalEvents = events.length;
  const totalSurveys = surveys.length;
  const totalDonations = donations.length;
  const totalDonationAmount = donations.reduce(
    (sum, d) => sum + (Number(d.amount) || 0),
    0
  );

  const kpis = [
    { label: 'Participants', value: totalParticipants },
    { label: 'Events', value: totalEvents },
    { label: 'Surveys Submitted', value: totalSurveys },
    { label: 'Total Donations ($)', value: totalDonationAmount },
  ];

  const trendLabels = ['2022', '2023', '2024', '2025'];
  const trendScores = [2, 5, 9, 14];

  const milestoneLabels = milestones.map((m) => m.title);
  const milestoneCounts = milestones.map(
    (m) =>
      participantMilestones.filter((pm) => pm.milestone_id === m.id).length
  );

  const eventTypes = [...new Set(events.map((e) => e.type))];
  const cities = [...new Set(participants.map((p) => p.city))];
  const grades = [...new Set(participants.map((p) => p.grade))];

  res.render('dashboard/index', {
    eventTypes,
    cities,
    grades,
    kpis,
    trendLabels,
    trendScores,
    milestoneLabels,
    milestoneCounts,
  });
});

// =======================
// USER MAINTENANCE
// =======================

app.get('/users', requireManager, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let filtered = users;

  if (q) {
    filtered = users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }

  res.render('users/index', { users: filtered, q });
});

app.get('/users/new', requireManager, (req, res) => {
  res.render('users/form', {
    formTitle: 'Create User',
    formAction: '/users',
    user: {},
  });
});

app.post('/users', requireManager, (req, res) => {
  const { username, password, role } = req.body;
  users.push({
    id: nextUserId++,
    username,
    password: password || 'password',
    role: role === 'manager' ? 'manager' : 'user',
  });
  req.session.success = 'User created.';
  res.redirect('/users');
});

app.get('/users/:id/edit', requireManager, (req, res) => {
  const user = users.find((u) => u.id === Number(req.params.id));
  if (!user) {
    req.session.error = 'User not found.';
    return res.redirect('/users');
  }
  res.render('users/form', {
    formTitle: 'Edit User',
    formAction: `/users/${user.id}`,
    user,
  });
});

app.post('/users/:id', requireManager, (req, res) => {
  const user = users.find((u) => u.id === Number(req.params.id));
  if (!user) {
    req.session.error = 'User not found.';
    return res.redirect('/users');
  }
  const { username, password, role } = req.body;
  user.username = username;
  if (password) {
    user.password = password;
  }
  user.role = role === 'manager' ? 'manager' : 'user';
  req.session.success = 'User updated.';
  res.redirect('/users');
});

app.post('/users/:id/delete', requireManager, (req, res) => {
  users = users.filter((u) => u.id !== Number(req.params.id));
  req.session.success = 'User deleted.';
  res.redirect('/users');
});

// =======================
// PARTICIPANT MAINTENANCE
// =======================

app.get('/participants', requireLogin, (req, res) => {
  const q = (req.query.q || '').toLowerCase();

  let filtered = participants;

  if (q) {
    filtered = participants.filter((p) => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.city && p.city.toLowerCase().includes(q))
      );
    });
  }

  const viewModels = filtered.map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    city: p.city,
    grade: p.grade,
    email: p.email,
    events_count: 0, // could be derived from registrations later
  }));

  res.render('participants/index', { participants: viewModels, q });
});

app.get('/participants/new', requireManager, (req, res) => {
  res.render('participants/form', {
    formTitle: 'Add Participant',
    formAction: '/participants',
    participant: {},
  });
});

app.post('/participants', requireManager, (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    city,
    state,
    zip,
    school,
    grade,
    field_of_interest,
  } = req.body;

  participants.push({
    id: nextParticipantId++,
    first_name,
    last_name,
    email,
    phone,
    city,
    state,
    zip,
    school,
    grade,
    field_of_interest,
    role: 'Participant',
  });

  req.session.success = 'Participant added.';
  res.redirect('/participants');
});

app.get('/participants/:id', requireLogin, (req, res) => {
  const participant = participants.find((p) => p.id === Number(req.params.id));
  if (!participant) {
    req.session.error = 'Participant not found.';
    return res.redirect('/participants');
  }

  const milestonesForParticipant = participantMilestones
    .filter((pm) => pm.participant_id === participant.id)
    .map((pm) => {
      const milestone = milestones.find((m) => m.id === pm.milestone_id);
      if (!milestone) return null;
      return {
        id: milestone.id,
        title: milestone.title,
        achieved_date_formatted: formatDateShort(pm.milestone_date),
      };
    })
    .filter(Boolean);

  const participantVm = {
    ...participant,
    milestones: milestonesForParticipant,
  };

  res.render('participants/show', {
    participant: participantVm,
  });
});

app.get('/participants/:id/edit', requireManager, (req, res) => {
  const participant = participants.find((p) => p.id === Number(req.params.id));
  if (!participant) {
    req.session.error = 'Participant not found.';
    return res.redirect('/participants');
  }

  res.render('participants/form', {
    formTitle: 'Edit Participant',
    formAction: `/participants/${participant.id}`,
    participant,
  });
});

app.post('/participants/:id', requireManager, (req, res) => {
  const participant = participants.find((p) => p.id === Number(req.params.id));
  if (!participant) {
    req.session.error = 'Participant not found.';
    return res.redirect('/participants');
  }

  const {
    first_name,
    last_name,
    email,
    phone,
    city,
    state,
    zip,
    school,
    grade,
    field_of_interest,
  } = req.body;

  Object.assign(participant, {
    first_name,
    last_name,
    email,
    phone,
    city,
    state,
    zip,
    school,
    grade,
    field_of_interest,
  });

  req.session.success = 'Participant updated.';
  res.redirect('/participants');
});

app.post('/participants/:id/delete', requireManager, (req, res) => {
  const id = Number(req.params.id);
  participants = participants.filter((p) => p.id !== id);
  participantMilestones = participantMilestones.filter(
    (pm) => pm.participant_id !== id
  );
  req.session.success = 'Participant deleted.';
  res.redirect('/participants');
});

// Assign milestones to a participant
app.get('/participants/:id/milestones/assign', requireManager, (req, res) => {
  const participant = participants.find((p) => p.id === Number(req.params.id));
  if (!participant) {
    req.session.error = 'Participant not found.';
    return res.redirect('/participants');
  }

  res.render('milestones/assign', {
    participant,
    milestones,
  });
});

app.post('/participants/:id/milestones', requireManager, (req, res) => {
  const participantId = Number(req.params.id);
  const participant = participants.find((p) => p.id === participantId);
  if (!participant) {
    req.session.error = 'Participant not found.';
    return res.redirect('/participants');
  }

  const { milestone_id, achieved_date } = req.body;

  if (!milestone_id) {
    req.session.error = 'Please select a milestone.';
    return res.redirect(`/participants/${participantId}`);
  }

  participantMilestones.push({
    participant_id: participantId,
    milestone_id: Number(milestone_id),
    milestone_date: achieved_date || new Date().toISOString().slice(0, 10),
  });

  req.session.success = 'Milestone assigned.';
  res.redirect(`/participants/${participantId}`);
});

// =======================
// MILESTONES MAINTENANCE
// =======================

app.get('/milestones', requireLogin, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let filtered = milestones;

  if (q) {
    filtered = milestones.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }

  res.render('milestones/index', { milestones: filtered, q });
});

app.get('/milestones/new', requireManager, (req, res) => {
  res.render('milestones/form', {
    formTitle: 'Create Milestone',
    formAction: '/milestones',
    milestone: {},
  });
});

app.post('/milestones', requireManager, (req, res) => {
  const { title, description } = req.body;
  milestones.push({
    id: nextMilestoneId++,
    title,
    description,
  });
  req.session.success = 'Milestone created.';
  res.redirect('/milestones');
});

app.get('/milestones/:id/edit', requireManager, (req, res) => {
  const milestone = milestones.find((m) => m.id === Number(req.params.id));
  if (!milestone) {
    req.session.error = 'Milestone not found.';
    return res.redirect('/milestones');
  }

  res.render('milestones/form', {
    formTitle: 'Edit Milestone',
    formAction: `/milestones/${milestone.id}`,
    milestone,
  });
});

app.post('/milestones/:id', requireManager, (req, res) => {
  const milestone = milestones.find((m) => m.id === Number(req.params.id));
  if (!milestone) {
    req.session.error = 'Milestone not found.';
    return res.redirect('/milestones');
  }

  const { title, description } = req.body;
  milestone.title = title;
  milestone.description = description;
  req.session.success = 'Milestone updated.';
  res.redirect('/milestones');
});

app.post('/milestones/:id/delete', requireManager, (req, res) => {
  const id = Number(req.params.id);
  milestones = milestones.filter((m) => m.id !== id);
  participantMilestones = participantMilestones.filter(
    (pm) => pm.milestone_id !== id
  );
  req.session.success = 'Milestone deleted.';
  res.redirect('/milestones');
});

// =======================
// EVENTS MAINTENANCE
// =======================

app.get('/events/admin', requireLogin, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let filtered = events;

  if (q) {
    filtered = events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }

  const viewModels = filtered.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    location: e.location,
    dateFormatted: formatDateShort(e.start),
    capacity: e.capacity,
  }));

  res.render('events/index', { events: viewModels, q });
});

app.get('/events/new', requireManager, (req, res) => {
  res.render('events/form', {
    formTitle: 'Create Event',
    formAction: '/events',
    event: {},
  });
});

app.post('/events', requireManager, (req, res) => {
  const { name, type, description, location, date_start, date_end, capacity } =
    req.body;

  events.push({
    id: nextEventId++,
    name,
    type,
    description,
    location,
    start: date_start ? new Date(date_start) : new Date(),
    end: date_end ? new Date(date_end) : new Date(),
    capacity: Number(capacity) || 0,
  });

  req.session.success = 'Event created.';
  res.redirect('/events/admin');
});

app.get('/events/:id', requireLogin, (req, res) => {
  const event = events.find((e) => e.id === Number(req.params.id));
  if (!event) {
    req.session.error = 'Event not found.';
    return res.redirect('/events/admin');
  }

  const viewModel = {
    ...event,
    dateFormatted: formatDateShort(event.start),
    endDateFormatted: formatDateShort(event.end),
  };

  res.render('events/show', { event: viewModel });
});

app.get('/events/:id/edit', requireManager, (req, res) => {
  const event = events.find((e) => e.id === Number(req.params.id));
  if (!event) {
    req.session.error = 'Event not found.';
    return res.redirect('/events/admin');
  }

  res.render('events/form', {
    formTitle: 'Edit Event',
    formAction: `/events/${event.id}`,
    event,
  });
});

app.post('/events/:id', requireManager, (req, res) => {
  const event = events.find((e) => e.id === Number(req.params.id));
  if (!event) {
    req.session.error = 'Event not found.';
    return res.redirect('/events/admin');
  }

  const { name, type, description, location, date_start, date_end, capacity } =
    req.body;

  Object.assign(event, {
    name,
    type,
    description,
    location,
    start: date_start ? new Date(date_start) : event.start,
    end: date_end ? new Date(date_end) : event.end,
    capacity: Number(capacity) || 0,
  });

  req.session.success = 'Event updated.';
  res.redirect('/events/admin');
});

app.post('/events/:id/delete', requireManager, (req, res) => {
  const id = Number(req.params.id);
  events = events.filter((e) => e.id !== id);
  req.session.success = 'Event deleted.';
  res.redirect('/events/admin');
});

// =======================
// SURVEYS MAINTENANCE
// =======================

app.get('/surveys', requireLogin, (req, res) => {
  const q = (req.query.q || '').toLowerCase();

  const rows = surveys.map((s) => {
    const participant = participants.find((p) => p.id === s.participant_id);
    const event = events.find((e) => e.id === s.event_id);
    return {
      id: s.id,
      participantName: participant
        ? `${participant.first_name} ${participant.last_name}`
        : 'Unknown',
      eventName: event ? event.name : 'Unknown',
      submitted_at: formatDateShort(s.submitted_at),
      satisfaction: s.satisfaction,
      usefulness: s.usefulness,
      recommend: s.recommend,
    };
  });

  let filtered = rows;

  if (q) {
    filtered = rows.filter(
      (r) =>
        r.participantName.toLowerCase().includes(q) ||
        r.eventName.toLowerCase().includes(q)
    );
  }

  res.render('surveys/index', { surveys: filtered, q });
});

app.get('/surveys/new', requireManager, (req, res) => {
  res.render('surveys/form', {
    formTitle: 'Record Survey',
    formAction: '/surveys',
    survey: {},
    participants,
    events,
  });
});

app.post('/surveys', requireManager, (req, res) => {
  const {
    participant_id,
    event_id,
    satisfaction,
    usefulness,
    recommend,
    comment,
  } = req.body;

  surveys.push({
    id: nextSurveyId++,
    participant_id: Number(participant_id),
    event_id: Number(event_id),
    submitted_at: new Date(),
    satisfaction: Number(satisfaction) || null,
    usefulness: Number(usefulness) || null,
    recommend: Number(recommend) || null,
    comment,
  });

  req.session.success = 'Survey recorded.';
  res.redirect('/surveys');
});

app.get('/surveys/:id', requireLogin, (req, res) => {
  const survey = surveys.find((s) => s.id === Number(req.params.id));
  if (!survey) {
    req.session.error = 'Survey not found.';
    return res.redirect('/surveys');
  }

  const participant = participants.find((p) => p.id === survey.participant_id);
  const event = events.find((e) => e.id === survey.event_id);

  res.render('surveys/show', {
    survey,
    participant,
    event,
  });
});

app.get('/surveys/:id/edit', requireManager, (req, res) => {
  const survey = surveys.find((s) => s.id === Number(req.params.id));
  if (!survey) {
    req.session.error = 'Survey not found.';
    return res.redirect('/surveys');
  }

  res.render('surveys/form', {
    formTitle: 'Edit Survey',
    formAction: `/surveys/${survey.id}`,
    survey,
    participants,
    events,
  });
});

app.post('/surveys/:id', requireManager, (req, res) => {
  const survey = surveys.find((s) => s.id === Number(req.params.id));
  if (!survey) {
    req.session.error = 'Survey not found.';
    return res.redirect('/surveys');
  }

  const {
    participant_id,
    event_id,
    satisfaction,
    usefulness,
    recommend,
    comment,
  } = req.body;

  Object.assign(survey, {
    participant_id: Number(participant_id),
    event_id: Number(event_id),
    satisfaction: Number(satisfaction) || null,
    usefulness: Number(usefulness) || null,
    recommend: Number(recommend) || null,
    comment,
  });

  req.session.success = 'Survey updated.';
  res.redirect('/surveys');
});

app.post('/surveys/:id/delete', requireManager, (req, res) => {
  const id = Number(req.params.id);
  surveys = surveys.filter((s) => s.id !== id);
  req.session.success = 'Survey deleted.';
  res.redirect('/surveys');
});

// =======================
// DONATIONS MAINTENANCE
// =======================

// Public-facing simple donation capture
app.post('/donations/public', (req, res) => {
  const { donor_name, donor_email, amount, source } = req.body;

  donations.push({
    id: nextDonationId++,
    participant_id: null,
    donor_name: donor_name || 'Anonymous',
    donor_email: donor_email || null,
    amount: Number(amount) || 0,
    date: new Date().toISOString().slice(0, 10),
    source: source || 'Public form',
  });

  req.session.success = 'Thank you for your support!';
  res.redirect('/donate');
});

// Admin donations view
app.get('/donations', requireLogin, (req, res) => {
  const q = (req.query.q || '').toLowerCase();

  let rows = donations.map((d) => {
    const participant = d.participant_id
      ? participants.find((p) => p.id === d.participant_id)
      : null;
    return {
      id: d.id,
      donor:
        d.donor_name ||
        (participant ? `${participant.first_name} ${participant.last_name}` : 'Anonymous'),
      email: d.donor_email || (participant ? participant.email : null),
      amount: d.amount,
      date: formatDateShort(d.date),
      source: d.source,
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        (r.donor && r.donor.toLowerCase().includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q))
    );
  }

  res.render('donations/index', { donations: rows, q });
});

app.get('/donations/new', requireManager, (req, res) => {
  const prefillAmount = req.query.amount || '';
  res.render('donations/form', {
    formTitle: 'Record Donation',
    formAction: '/donations',
    donation: { amount: prefillAmount },
    participants,
  });
});

app.post('/donations', requireManager, (req, res) => {
  const { participant_id, donor_name, donor_email, amount, date, source } =
    req.body;

  donations.push({
    id: nextDonationId++,
    participant_id: participant_id ? Number(participant_id) : null,
    donor_name,
    donor_email,
    amount: Number(amount) || 0,
    date: date || new Date().toISOString().slice(0, 10),
    source,
  });

  req.session.success = 'Donation recorded.';
  res.redirect('/donations');
});

app.get('/donations/:id/edit', requireManager, (req, res) => {
  const donation = donations.find((d) => d.id === Number(req.params.id));
  if (!donation) {
    req.session.error = 'Donation not found.';
    return res.redirect('/donations');
  }

  res.render('donations/form', {
    formTitle: 'Edit Donation',
    formAction: `/donations/${donation.id}`,
    donation,
    participants,
  });
});

app.post('/donations/:id', requireManager, (req, res) => {
  const donation = donations.find((d) => d.id === Number(req.params.id));
  if (!donation) {
    req.session.error = 'Donation not found.';
    return res.redirect('/donations');
  }

  const { participant_id, donor_name, donor_email, amount, date, source } =
    req.body;

  Object.assign(donation, {
    participant_id: participant_id ? Number(participant_id) : null,
    donor_name,
    donor_email,
    amount: Number(amount) || 0,
    date: date || donation.date,
    source,
  });

  req.session.success = 'Donation updated.';
  res.redirect('/donations');
});

app.post('/donations/:id/delete', requireManager, (req, res) => {
  const id = Number(req.params.id);
  donations = donations.filter((d) => d.id !== id);
  req.session.success = 'Donation deleted.';
  res.redirect('/donations');
});

// =======================
// FALLBACK
// =======================

app.use((req, res) => {
  res.status(404);
  const upcomingEvents = events
    .slice()
    .sort((a, b) => a.start - b.start)
    .slice(0, 3)
    .map((e) => ({ ...e, dateFormatted: formatDateShort(e.start) }));

  const impactStats = {
    participantsCount: participants.length,
    avgSatisfaction:
      surveys.length === 0
        ? null
        : (
            surveys.reduce((sum, s) => sum + (s.satisfaction || 0), 0) /
            surveys.length
          ).toFixed(1),
    avgRecommend:
      surveys.length === 0
        ? null
        : (
            surveys.reduce((sum, s) => sum + (s.recommend || 0), 0) /
            surveys.length
          ).toFixed(1),
    milestonesAchieved: participantMilestones.length,
  };

  res.render('public/home', { upcomingEvents, impactStats });
});


// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`Ella Rises app preview running on http://localhost:${PORT}`);
});