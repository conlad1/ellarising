const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// ----- View engine / static files -----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// ----- Fake "globals" so the views don't crash -----
app.use((req, res, next) => {
  // Simulate a logged-in manager so you can see all nav links
  res.locals.currentUser = {
    username: 'TestManager',
    role: 'manager'
  };

  // Simple placeholders so flash.ejs doesn't blow up
  res.locals.success = null;
  res.locals.error = null;

  next();
});

// =======================
// ROUTES JUST TO PREVIEW
// =======================

// Home (landing page)
app.get('/', (req, res) => {
  const impactStats = {
    participantsCount: 123,
    avgSatisfaction: 4.7,
    milestonesCount: 56
  };

  res.render('public/home', { impactStats });
});

// Programs
app.get('/programs', (req, res) => {
  res.render('public/programs');
});

// Public events
app.get('/events', (req, res) => {
  const events = [
    {
      id: 1,
      name: 'STEAM Summit',
      type: 'Summit',
      dateFormatted: 'Nov 15, 2025',
      location: 'UVU',
      description: 'A multi-day STEAM experience.'
    },
    {
      id: 2,
      name: 'Mariachi Workshop',
      type: 'Workshop',
      dateFormatted: 'Dec 3, 2025',
      location: 'BYU',
      description: 'Music + culture + confidence.'
    }
  ];

  res.render('public/events_public', { events });
});

// Donate
app.get('/donate', (req, res) => {
  res.render('public/donate');
});

// Impact (public summary)
app.get('/impact', (req, res) => {
  const impactStats = {
    participantsCount: 123,
    avgRecommend: 9.1,
    steamMajorRate: 35,
    steamJobRate: 22
  };

  res.render('public/impact', { impactStats });
});

// Login
app.get('/login', (req, res) => {
  const csrfToken = null; // you can hook real CSRF later
  res.render('auth/login', { csrfToken });
});

// Logout (fake, just redirect home for now)
app.post('/logout', (req, res) => {
  // later you'll destroy the session here
  res.redirect('/');
});

// ----- Participants -----
app.get('/participants', (req, res) => {
  const participants = [
    {
      id: 1,
      first_name: 'Ana',
      last_name: 'Lopez',
      school: 'Provo High',
      grade: '10',
      city: 'Provo',
      milestoneCount: 2
    },
    {
      id: 2,
      first_name: 'Maria',
      last_name: 'Sanchez',
      school: 'Timpview High',
      grade: '11',
      city: 'Orem',
      milestoneCount: 1
    }
  ];

  res.render('participants/index', { participants });
});

app.get('/participants/:id', (req, res) => {
  // fake participant w/ milestones
  const participant = {
    id: req.params.id,
    first_name: 'Ana',
    last_name: 'Lopez',
    school: 'Provo High',
    grade: '10',
    city: 'Provo',
    email: 'ana@example.com',
    phone: '555-1234',
    milestones: [
      { title: 'Applied to STEM camp', achieved_date_formatted: 'Jun 2025' },
      { title: 'Enrolled in AP Math', achieved_date_formatted: 'Aug 2025' }
    ]
  };

  res.render('participants/show', { participant });
});

app.get('/participants/new', (req, res) => {
  const csrfToken = null;
  res.render('participants/form', {
    formTitle: 'Add Participant',
    formAction: '/participants',
    participant: null,
    csrfToken
  });
});

// ----- Events admin -----
app.get('/events/admin', (req, res) => {
  const events = [
    {
      id: 1,
      name: 'STEAM Summit',
      type: 'Summit',
      dateFormatted: 'Nov 15, 2025',
      location: 'UVU'
    },
    {
      id: 2,
      name: 'Mariachi Workshop',
      type: 'Workshop',
      dateFormatted: 'Dec 3, 2025',
      location: 'BYU'
    }
  ];

  res.render('events/index', { events });
});

app.get('/events/:id', (req, res) => {
  const event = {
    id: req.params.id,
    name: 'STEAM Summit',
    type: 'Summit',
    dateFormatted: 'Nov 15, 2025',
    location: 'UVU',
    description: 'A multi-day STEAM experience with hands-on activities.'
  };

  res.render('events/show', { event });
});

app.get('/events/new', (req, res) => {
  const csrfToken = null;
  res.render('events/form', {
    formTitle: 'Create Event',
    formAction: '/events',
    event: null,
    csrfToken
  });
});

// ----- Surveys -----
app.get('/surveys', (req, res) => {
  const surveys = [
    {
      id: 1,
      event_name: 'STEAM Summit',
      participant_name: 'Ana Lopez',
      satisfaction: 5,
      usefulness: 5,
      recommendation: 10
    }
  ];

  res.render('surveys/index', { surveys });
});

app.get('/surveys/:id', (req, res) => {
  const survey = {
    id: req.params.id,
    event_name: 'STEAM Summit',
    participant_name: 'Ana Lopez',
    satisfaction: 5,
    usefulness: 5,
    recommendation: 10,
    comments: 'I feel more confident about pursuing engineering.'
  };

  res.render('surveys/show', { survey });
});

app.get('/surveys/new', (req, res) => {
  const csrfToken = null;
  const events = [
    { id: 1, name: 'STEAM Summit', dateFormatted: 'Nov 15, 2025' }
  ];
  const participants = [
    { id: 1, first_name: 'Ana', last_name: 'Lopez' }
  ];

  res.render('surveys/form', {
    formTitle: 'New Survey',
    formAction: '/surveys',
    survey: null,
    events,
    participants,
    csrfToken
  });
});

// ----- Milestones -----
app.get('/milestones', (req, res) => {
  const milestones = [
    { id: 1, title: 'Applied to College', description: 'Participant submitted at least one college application.' },
    { id: 2, title: 'Declared STEAM Major', description: 'Participant declared a major in a STEAM field.' }
  ];

  res.render('milestones/index', { milestones });
});

app.get('/milestones/new', (req, res) => {
  const csrfToken = null;
  res.render('milestones/form', {
    formTitle: 'Add Milestone',
    formAction: '/milestones',
    milestone: null,
    csrfToken
  });
});

app.get('/participants/:id/milestones/assign', (req, res) => {
  const csrfToken = null;
  const participant = {
    id: req.params.id,
    first_name: 'Ana',
    last_name: 'Lopez'
  };
  const milestones = [
    { id: 1, title: 'Applied to College' },
    { id: 2, title: 'Declared STEAM Major' }
  ];

  res.render('milestones/assign', {
    participant,
    milestones,
    csrfToken
  });
});

// ----- Donations -----
app.get('/donations', (req, res) => {
  const totals = {
    totalAmount: 2500,
    count: 12
  };

  const donations = [
    {
      id: 1,
      dateFormatted: 'Oct 1, 2025',
      donor_name: 'BYU Alumni Association',
      amount: 1000,
      source: 'Grant'
    },
    {
      id: 2,
      dateFormatted: 'Oct 10, 2025',
      donor_name: 'Anonymous',
      amount: 500,
      source: 'Individual'
    }
  ];

  res.render('donations/index', { totals, donations });
});

app.get('/donations/new', (req, res) => {
  const csrfToken = null;
  res.render('donations/form', {
    formTitle: 'Record Donation',
    formAction: '/donations',
    donation: null,
    csrfToken
  });
});

// ----- Dashboard -----
app.get('/dashboard', (req, res) => {
  const filters = {
    eventType: '',
    grade: ''
  };

  const eventTypes = ['Workshop', 'Summit', 'Mentoring'];
  const grades = ['7', '8', '9', '10', '11', '12'];

  const kpis = {
    participants: 123,
    avgSatisfaction: 4.7,
    avgUsefulness: 4.5,
    milestones: 56
  };

  const trendLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const trendScores = [4.2, 4.4, 4.5, 4.7, 4.8, 4.9];

  const milestoneLabels = ['Workshop', 'Summit', 'Mentoring'];
  const milestoneCounts = [15, 25, 16];

  res.render('dashboard/index', {
    filters,
    eventTypes,
    grades,
    kpis,
    trendLabels,
    trendScores,
    milestoneLabels,
    milestoneCounts
  });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`Ella Rises app preview running on http://localhost:${PORT}`);
});
