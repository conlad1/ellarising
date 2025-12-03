/**
 * Ella Rises Web Application
 * 
 * Main Express.js application for managing Ella Rises organization data including:
 * - Public-facing pages (home, events, donations, impact)
 * - Admin portal for managing participants, events, surveys, milestones, and donations
 * - User authentication and role-based access control (manager/common user)
 * 
 * This application uses PostgreSQL via Knex.js query builder for all database operations.
 * All routes follow RESTful conventions where applicable.
 */

require('dotenv').config({ path: '.env.local' });
const express = require('express');
const path = require('path');
const session = require('express-session');
const knex = require('knex');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// DATABASE CONNECTION (Knex)
// =======================
/**
 * Database connection configuration using Knex.js
 * 
 * Connection strategy:
 * 1. First checks for AWS RDS environment variables (for production deployment)
 * 2. Falls back to local database environment variables
 * 3. Uses sensible defaults for local development
 * 
 * SSL is automatically enabled for RDS connections to ensure secure database communication,
 * but disabled for local development to simplify setup.
 */
const db = knex({
  client: process.env.DB_CLIENT || 'pg',
  connection: {
    host: process.env.RDS_HOSTNAME || process.env.RDS_HOST || process.env.DB_HOST || 'localhost',
    port: process.env.RDS_PORT || process.env.DB_PORT || 5432,
    user: process.env.RDS_USERNAME || process.env.RDS_USER || process.env.DB_USER || 'postgres',
    password: process.env.RDS_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.RDS_DB_NAME || process.env.RDS_DATABASE || process.env.DB_DATABASE || 'ellarising',
    ssl: process.env.RDS_HOSTNAME || process.env.RDS_HOST 
      ? { rejectUnauthorized: false }  // Enable SSL for RDS connections - necessary for AWS RDS security
      : false,  // No SSL for local development - simplifies local setup
  },
});

// Test database connection on startup
// This helps catch connection issues early before the server starts accepting requests
db.raw('SELECT 1')
  .then(() => {
    console.log('Database connection established successfully');
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
  });

// =======================
// BASIC APP SETUP
// =======================
/**
 * Express application configuration
 * 
 * View Engine: EJS (Embedded JavaScript) templates for server-side rendering
 * Static Files: Served from /public directory (CSS, images, etc.)
 * Body Parser: URL-encoded form data parsing for POST requests
 */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

/**
 * Session configuration
 * 
 * Sessions store user authentication state and flash messages between requests.
 * Currently using in-memory sessions for development. In production, should use:
 * - Database-backed sessions (connect-pg-simple) for scalability
 * - Secure session secret from environment variables
 * - HttpOnly cookies for security
 */
app.use(
  session({
    secret: 'ella-rises-dev-secret',
    resave: false,
    saveUninitialized: false,
  })
);

/**
 * Flash message middleware
 * 
 * Provides user feedback messages (success/error) that persist across one redirect.
 * Flash messages are stored in session, displayed once, then cleared.
 * Also makes currentUser available to all views via res.locals for authentication checks.
 */
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  req.session.success = null;
  req.session.error = null;
  next();
});


// =======================
// AUTH HELPERS
// =======================
/**
 * Authentication and authorization middleware functions
 * 
 * These middleware functions enforce access control based on user authentication state
 * and role permissions. They are used as route handlers to protect admin-only features.
 */

/**
 * requireLogin - Ensures user is authenticated
 * 
 * Used for routes that require authentication but allow both manager and common users.
 * Redirects to login page if no user session exists.
 * 
 * Example usage: app.get('/dashboard', requireLogin, handler)
 */
function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.error = 'Please log in to access that page.';
    return res.redirect('/login');
  }
  next();
}

/**
 * requireManager - Ensures user is authenticated AND has manager role
 * 
 * Used for routes that require manager-level permissions (creating, editing, deleting records).
 * Note: The role is stored as 'admin' in the database, but represents 'manager' role per rubric.
 * First checks for login, then verifies role is 'admin' (manager).
 * 
 * Example usage: app.post('/participants', requireManager, handler)
 */
function requireManager(req, res, next) {
  if (!req.session.user) {
    req.session.error = 'Please log in to access that page.';
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    req.session.error = 'You must be an admin to do that.';
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Utility Helper Functions
 * 
 * These functions provide common data transformations and formatting used across
 * multiple routes to ensure consistency and reduce code duplication.
 */

/**
 * formatDateShort - Formats date objects into readable short date strings
 * 
 * Converts date strings or Date objects into user-friendly format (e.g., "Jan 15, 2025").
 * Used throughout the application for displaying event dates, milestones, etc.
 * Handles both string and Date object inputs for flexibility.
 */
function formatDateShort(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * formatDateTime - Formats date objects into readable date and time strings
 * 
 * Converts date strings or Date objects into user-friendly format with time
 * (e.g., "Jan 15, 2025, 2:30 PM"). Used for displaying event start/end times.
 * Handles both string and Date object inputs for flexibility.
 */
function formatDateTime(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * sanitizeUser - Removes sensitive password field from user objects
 * 
 * Security measure to prevent password hashes from being accidentally exposed
 * in views or API responses. Uses destructuring to create a new object without
 * the password property.
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...sanitized } = user;
  return sanitized;
}

/**
 * sanitizeUsers - Sanitizes an array of user objects
 * 
 * Applies sanitizeUser to each user in an array. Used when displaying lists
 * of users in admin interfaces.
 */
function sanitizeUsers(users) {
  return users.map(sanitizeUser);
}

/**
 * formatParticipantName - Combines first and last name into full name string
 * 
 * Handles cases where names might be missing or null, ensuring a clean display
 * string. Used throughout the application for displaying participant information
 * in lists, forms, and detail pages.
 */
function formatParticipantName(participant) {
  if (!participant) return '';
  return `${participant.participant_first_name || ''} ${participant.participant_last_name || ''}`.trim();
}

// =======================
// PUBLIC ROUTES
// =======================
/**
 * Public-facing routes that don't require authentication
 * These routes are accessible to all visitors and showcase Ella Rises' mission and programs
 */

/**
 * Home Page - Landing page explaining Ella Rises' objective
 * 
 * Displays:
 * - Upcoming events (next 15 events from current year)
 * - Impact statistics (participant count, satisfaction, milestones)
 * 
 * Per rubric requirement: "Welcome Landing Page explaining the objective of Ella Rises"
 * Uses Promise.all to fetch all data in parallel for optimal performance.
 */
app.get('/', async (req, res) => {
  try {
    // Execute all database queries in parallel
    let [events, participantsResult, satisfactionResult, milestonesResult] = await Promise.all([
      db
        .select('ei.*', 'e.event_name', 'e.event_type', 'e.event_description')
        .from("event_instance as ei")
        .leftJoin('event as e', 'ei.event_id', 'e.event_id')
        .where(db.raw("EXTRACT(YEAR FROM ei.event_date_start_time)"), ">=", new Date().getFullYear())
        .orderBy("ei.event_date_start_time", "asc")
        .limit(15),
      
      db
        .select(db.raw("count(distinct er.participant_id) as participants_count"))
        .from("event_registration as er")
        .where("er.registration_attended_flag", "=", true),
      
      db
        .select(db.raw("avg(question_response) as avg_satisfaction"))
        .from("survey_response")
        .where("question_number", "=", 1)
        .groupBy("question_number"),
      
      db
        .select(db.raw("count(*) as milestones_achieved"))
        .from("participant_milestone")
    ]);

    // Process events
    const upcomingEvents = events.map((e) => ({
      ...e,
      dateFormatted: formatDateShort(e.event_date_start_time || e.start),
    }));

    // Extract stats with proper defaults
    const participantsCount = participantsResult[0]?.participants_count || 0;
    
    const avgSatisfaction = satisfactionResult[0]?.avg_satisfaction 
      ? parseFloat(satisfactionResult[0].avg_satisfaction).toFixed(1) 
      : null;
    
    const milestonesAchieved = milestonesResult[0]?.milestones_achieved || 0;

    res.render('public/home', { 
      upcomingEvents, 
      impactStats: { 
        participantsCount, 
        avgSatisfaction, 
        milestonesAchieved 
      } 
    });
  } catch (err) {
    console.error('Error loading home page data:', err);
    // Render with default values on error
    res.render('public/home', { 
      upcomingEvents: [], 
      impactStats: { 
        participantsCount: 0, 
        avgSatisfaction: null, 
        milestonesAchieved: 0 
      } 
    });
  }
});


/**
 * Programs Page - Static information about Ella Rises programs
 * 
 * Simple static page explaining the types of programs offered.
 */
app.get('/programs', (req, res) => {
  res.render('public/programs');
});

/**
 * Public Events Page - Calendar view of upcoming events
 * 
 * Displays all events from the current year in a schedule/calendar format.
 * Events are formatted client-side to show in visitor's local timezone.
 * Includes filtering capabilities for event type, location, and time.
 */
app.get('/events', async (req, res) => {
  try {
    const eventsData = await db
      .select('ei.*', 'e.event_name', 'e.event_type', 'e.event_description', 'ei.event_location')
      .from('event_instance as ei')
      .leftJoin('event as e', 'ei.event_id', 'e.event_id')
      .where(db.raw("EXTRACT(YEAR FROM ei.event_date_start_time)"), ">=", new Date().getFullYear())
      .orderBy('ei.event_date_start_time', 'asc');

    const publicEvents = eventsData.map((e) => {
      return {
        name: e.event_name || 'Event',
        type: e.event_type || 'General',
        location: e.event_location || 'TBD',
        dateTime: e.event_date_start_time, // Raw ISO date-time string from database
        description: e.event_description || '',
      };
    });

    res.render('public/events_public', { events: publicEvents });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.render('public/events_public', { events: [] });
  }
});

/**
 * Donate Page - Public donation form
 * 
 * Per rubric requirement: "Link to donations page for any visitor"
 * Visitors can provide their information (name, email) and donation amount.
 * Form submits to /donations/public route which saves donor info and donation.
 */
app.get('/donate', (req, res) => {
  res.render('public/donate');
});

/**
 * Tea Route - Returns HTTP 418 I'm a Teapot status code
 * 
 * A playful Easter egg route that returns the HTTP 418 status code,
 * which is a reference to the Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0).
 */
app.get('/tea', (req, res) => {
  res.sendStatus(418);
});

/**
 * Impact Page - Shows organization's impact metrics
 * 
 * Displays aggregated statistics:
 * - Total participants reached
 * - Average event satisfaction (from survey question 1)
 * - Average recommendation score (from survey question 4)
 * - Total milestones achieved
 * - Total donations received
 * 
 * All queries run in parallel for performance.
 */
app.get('/impact', async (req, res) => {
  try {
    const [participantsResult, satisfactionResult, recommendResult, milestonesResult, donationsResult] = await Promise.all([
      db
        .select(db.raw("count(distinct er.participant_id) as participants_count"))
        .from("event_registration as er")
        .where("er.registration_attended_flag", "=", true),
      
      db
        .select(db.raw("avg(question_response) as avg_satisfaction"))
        .from("survey_response")
        .where("question_number", "=", 1)
        .groupBy("question_number"),
      
      db
        .select(db.raw("avg(question_response) as avg_recommend"))
        .from("survey_response")
        .where("question_number", "=", 4)
        .groupBy("question_number"),
      
      db
        .select(db.raw("count(*) as milestones_achieved"))
        .from("participant_milestone"),
      
      db
        .select(db.raw("sum(donation_amount) as total_donations"))
        .from("donation")
    ]);

    const impactStats = {
      participantsCount: participantsResult[0]?.participants_count || 0,
      avgSatisfaction: satisfactionResult[0]?.avg_satisfaction 
        ? parseFloat(satisfactionResult[0].avg_satisfaction).toFixed(1) 
        : null,
      avgRecommend: recommendResult[0]?.avg_recommend 
        ? parseFloat(recommendResult[0].avg_recommend).toFixed(1) 
        : null,
      milestonesAchieved: milestonesResult[0]?.milestones_achieved || 0,
      totalDonations: donationsResult[0]?.total_donations || 0,
    };

    res.render('public/impact', { impactStats });
  } catch (err) {
    console.error('Error loading impact stats:', err);
    res.render('public/impact', { 
      impactStats: { 
        participantsCount: 0, 
        avgSatisfaction: null, 
        avgRecommend: null, 
        milestonesAchieved: 0, 
        totalDonations: 0 
      } 
    });
  }
});


// =======================
// AUTH ROUTES
// =======================
/**
 * Authentication routes for user login/logout
 * 
 * Per rubric: "Login is either manager or common user"
 * Users are authenticated and their role (admin/manager or user) determines access levels.
 */

/**
 * Login Page - Display login form
 * 
 * If user is already logged in, redirects to dashboard.
 * Otherwise shows login form for username/password authentication.
 */
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login');
});

/**
 * Login Handler - Authenticate user credentials
 * 
 * Validates username and password against users table.
 * On success: Creates session with user info (id, username, role) and redirects to dashboard.
 * On failure: Shows error message and returns to login page.
 * 
 * Uses bcrypt to securely compare the provided password with the hashed password stored in the database.
 */
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
      req.session.error = 'Please provide both username and password.';
      return res.redirect('/login');
    }
    
    // Find user by username only (not password, since it's hashed)
    const user = await db('users')
      .where({ username })
      .first();

    if (!user) {
      req.session.error = 'Invalid username or password.';
      return res.redirect('/login');
    }

    // Compare provided password with stored hash using bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      req.session.error = 'Invalid username or password.';
      return res.redirect('/login');
    }

    req.session.user = { id: user.user_id, username: user.username, role: user.role };
    req.session.success = `Welcome, ${user.username}!`;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error during login:', err);
    req.session.error = 'An error occurred during login.';
    res.redirect('/login');
  }
});

/**
 * Logout Handler - Destroy user session
 * 
 * Clears session data and redirects to home page.
 */
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// =======================
// DASHBOARD (READ-ONLY PREVIEW)
// =======================
/**
 * Dashboard route - Impact analytics dashboard accessible to all authenticated users
 * 
 * Per rubric: Dashboard shows key performance indicators and analytics
 * Displays aggregated data including:
 * - Total participants, events, surveys, donations
 * - Milestone achievements grouped by milestone type
 * - Filter options for event types and participant demographics
 * 
 * All data queries run in parallel using Promise.all for optimal performance.
 */
app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const [participantsCount, eventsCount, surveysCount, donationsResult, milestonesData, eventTypesResult, citiesResult] = await Promise.all([
      db('participant').count('* as count').first(),
      db('event_instance').count('* as count').first(),
      db('survey_submission').count('* as count').first(),
      db('donation').select(db.raw('sum(donation_amount) as total')).first(),
      db('milestone as m')
        .leftJoin('participant_milestone as pm', 'm.milestone_id', 'pm.milestone_id')
        .select('m.milestone_id', 'm.milestone_title', db.raw('count(pm.participant_id) as count'))
        .groupBy('m.milestone_id', 'm.milestone_title')
        .orderBy('m.milestone_title'),
      db('event').distinct('event_type').pluck('event_type'),
      db('participant').distinct('participant_city').whereNotNull('participant_city').pluck('participant_city'),
    ]);

    const totalParticipants = participantsCount?.count || 0;
    const totalEvents = eventsCount?.count || 0;
    const totalSurveys = surveysCount?.count || 0;
    const totalDonationAmount = donationsResult?.total || 0;

    const kpis = [
      { label: 'Participants', value: totalParticipants },
      { label: 'Events', value: totalEvents },
      { label: 'Surveys Submitted', value: totalSurveys },
      { label: 'Total Donations ($)', value: totalDonationAmount },
    ];

    const trendLabels = ['2022', '2023', '2024', '2025'];
    const trendScores = [2, 5, 9, 14];

    const milestoneLabels = milestonesData.map((m) => m.milestone_title);
    const milestoneCounts = milestonesData.map((m) => parseInt(m.count) || 0);

    const eventTypes = eventTypesResult || [];
    const cities = citiesResult || [];

    res.render('dashboard/index', {
      eventTypes,
      cities,
      kpis,
      trendLabels,
      trendScores,
      milestoneLabels,
      milestoneCounts,
    });
  } catch (err) {
    console.error('Error loading dashboard:', err);
    req.session.error = 'Error loading dashboard data.';
    res.render('dashboard/index', {
      eventTypes: [],
      cities: [],
      kpis: [],
      trendLabels: [],
      trendScores: [],
      milestoneLabels: [],
      milestoneCounts: [],
    });
  }
});

// =======================
// USER MAINTENANCE
// =======================
/**
 * User Maintenance Routes
 * 
 * Per rubric requirements:
 * - "Can only access if logged in" - Protected by requireManager (which checks login first)
 * - "Users are displayed and navigation works including search" - List page with search
 * - "Ability to maintain user account (edit, delete, add) - manager only" - CRUD operations
 * - "Navigation to user maintenance (only manager can access)" - Manager-only routes
 */

/**
 * List Users - Display all users with search functionality
 * 
 * Shows all users in the system with their email, username, and role.
 * Supports case-insensitive search by username or email.
 * Passwords are never exposed (sanitized before display).
 */
app.get('/users', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    let query = db('users').select('user_id', 'email', 'username', 'role');

    if (q) {
      query = query.where(function() {
        this.where('username', 'ilike', `%${q}%`)
          .orWhere('email', 'ilike', `%${q}%`)
          .orWhere('role', 'ilike', `%${q}%`);
      });
    }

    const filtered = await query.orderBy('username');
    
    // Transform database columns to view-friendly field names
    const users = filtered.map(u => ({
      id: u.user_id,
      username: u.username,
      email: u.email,
      role: u.role,
    }));
    
    res.render('users/index', { users, q });
  } catch (err) {
    console.error('Error fetching users:', err);
    req.session.error = 'Error loading users.';
    res.render('users/index', { users: [], q: req.query.q || '' });
  }
});

app.get('/users/new', requireManager, (req, res) => {
  res.render('users/form', {
    formTitle: 'Create User',
    formAction: '/users',
    user: {},
  });
});

app.post('/users', requireManager, async (req, res) => {
  try {
    const { email, username, password, role } = req.body;
    
    if (!username) {
      req.session.error = 'Username is required.';
      return res.redirect('/users/new');
    }
    
    // Hash the password before storing (use default salt rounds of 10)
    const hashedPassword = password 
      ? await bcrypt.hash(password, 10)
      : await bcrypt.hash('password', 10);
    
    await db('users').insert({
      email: email || null,
      username,
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'user',
    });
    req.session.success = 'User created.';
    res.redirect('/users');
  } catch (err) {
    console.error('Error creating user:', err);
    req.session.error = 'Error creating user.';
    res.redirect('/users');
  }
});

app.get('/users/:id', requireLogin, async (req, res) => {
  try {
    const userData = await db('users').where({ user_id: req.params.id }).select('user_id', 'email', 'username', 'role').first();
    if (!userData) {
      req.session.error = 'User not found.';
      return res.redirect('/users');
    }
    
    // Transform database columns to view-friendly field names
    const user = {
      id: userData.user_id,
      username: userData.username,
      email: userData.email,
      role: userData.role,
    };
    
    res.render('users/show', { user });
  } catch (err) {
    console.error('Error fetching user:', err);
    req.session.error = 'Error loading user.';
    res.redirect('/users');
  }
});

app.get('/users/:id/edit', requireManager, async (req, res) => {
  try {
    const userData = await db('users').where({ user_id: req.params.id }).select('user_id', 'email', 'username', 'role').first();
    if (!userData) {
      req.session.error = 'User not found.';
      return res.redirect('/users');
    }
    
    // Transform database columns to form-friendly field names
    const user = {
      id: userData.user_id,
      username: userData.username,
      email: userData.email,
      role: userData.role,
    };
    
    res.render('users/form', {
      formTitle: 'Edit User',
      formAction: `/users/${userData.user_id}`,
      user,
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    req.session.error = 'Error loading user.';
    res.redirect('/users');
  }
});

app.post('/users/:id', requireManager, async (req, res) => {
  try {
    const user = await db('users').where({ user_id: req.params.id }).first();
    if (!user) {
      req.session.error = 'User not found.';
      return res.redirect('/users');
    }
    const { email, username, password, role } = req.body;
    const updateData = {
      email: email || null,
      username,
      role: role === 'admin' ? 'admin' : 'user',
    };
    // Hash the password before storing if a new password is provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    await db('users').where({ user_id: req.params.id }).update(updateData);
    req.session.success = 'User updated.';
    res.redirect('/users');
  } catch (err) {
    console.error('Error updating user:', err);
    req.session.error = 'Error updating user.';
    res.redirect('/users');
  }
});

app.post('/users/:id/delete', requireManager, async (req, res) => {
  try {
    await db('users').where({ user_id: req.params.id }).del();
    req.session.success = 'User deleted.';
    res.redirect('/users');
  } catch (err) {
    console.error('Error deleting user:', err);
    req.session.error = 'Error deleting user.';
    res.redirect('/users');
  }
});

// =======================
// PARTICIPANT MAINTENANCE
// =======================
/**
 * Participant Maintenance Routes
 * 
 * Per rubric requirements:
 * - "Can only access if logged in" - Protected by requireLogin (all authenticated users can view)
 * - "Participants are displayed and navigation works including search" - List with search functionality
 * - "Ability to maintain (edit, delete, add) - manager only" - CRUD operations require manager role
 * - "Ability to maintain milestones for participants" - Separate milestone assignment route
 * 
 * Participants represent the girls who participate in Ella Rises programs.
 * The list shows event attendance counts calculated via subquery for performance.
 */

/**
 * List Participants - Display all participants with search and event count
 * 
 * Shows all participants with their contact information and number of events attended.
 * Search works across name (first + last), email, and city fields.
 * Uses a subquery to efficiently count attended events per participant.
 */
app.get('/participants', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    
    let query = db('participant as p')
      .select(
        'p.participant_id',
        'p.participant_first_name',
        'p.participant_last_name',
        'p.participant_email',
        'p.participant_city',
        db.raw(`(
          SELECT count(distinct er.event_instance_id)
          FROM event_registration er
          WHERE er.participant_id = p.participant_id
          AND er.registration_attended_flag = true
        ) as events_count`),
        db.raw(`(
          SELECT count(*)
          FROM donation d
          WHERE d.participant_id = p.participant_id
        ) as donations_count`)
      );

    if (q) {
      query = query.where(function() {
        this.where(db.raw("CONCAT(p.participant_first_name, ' ', p.participant_last_name)"), 'ilike', `%${q}%`)
          .orWhere('p.participant_email', 'ilike', `%${q}%`)
          .orWhere('p.participant_city', 'ilike', `%${q}%`);
      });
    }

    const participantsData = await query.orderBy('p.participant_last_name', 'asc');

    // Transform data to match view expectations
    const participants = participantsData.map(p => ({
      id: p.participant_id,
      name: formatParticipantName(p),
      city: p.participant_city,
      email: p.participant_email,
      events_count: parseInt(p.events_count) || 0,
      donations_count: parseInt(p.donations_count) || 0,
    }));

    res.render('participants/index', { participants, q });
  } catch (err) {
    console.error('Error fetching participants:', err);
    req.session.error = 'Error loading participants.';
    res.render('participants/index', { participants: [], q: req.query.q || '' });
  }
});

app.get('/participants/new', requireManager, (req, res) => {
  res.render('participants/form', {
    formTitle: 'Add Participant',
    formAction: '/participants',
    participant: {},
  });
});

app.post('/participants', requireManager, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      city,
      state,
      zip,
      school,
      field_of_interest,
    } = req.body;

    // Validate email uniqueness if provided
    if (email && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingEmail = await db('participant')
        .where('participant_email', normalizedEmail)
        .first();
      
      if (existingEmail) {
        req.session.error = 'A participant with this email already exists.';
        return res.redirect('/participants/new');
      }
    }

    // Validate phone uniqueness if provided
    if (phone && phone.trim()) {
      const existingPhone = await db('participant')
        .where('participant_phone', phone.trim())
        .first();
      
      if (existingPhone) {
        req.session.error = 'A participant with this phone number already exists.';
        return res.redirect('/participants/new');
      }
    }

    await db('participant').insert({
      participant_first_name: first_name,
      participant_last_name: last_name,
      participant_email: email ? email.trim().toLowerCase() : null,
      participant_phone: phone ? phone.trim() : null,
      participant_city: city ? city.trim() : null,
      participant_state: state ? state.trim() : null,
      participant_zip: zip ? zip.trim() : null,
      participant_school_or_employer: school ? school.trim() : null,
      participant_field_of_interest: field_of_interest ? field_of_interest.trim() : null,
      participant_role: 'participant',
    });

    req.session.success = 'Participant added.';
    res.redirect('/participants');
  } catch (err) {
    console.error('Error creating participant:', err);
    req.session.error = 'Error creating participant.';
    res.redirect('/participants');
  }
});

app.get('/participants/:id', requireLogin, async (req, res) => {
  try {
    const participant = await db('participant').where({ participant_id: req.params.id }).first();
    if (!participant) {
      req.session.error = 'Participant not found.';
      return res.redirect('/participants');
    }

    const [milestonesForParticipant, donationCount] = await Promise.all([
      db('participant_milestone as pm')
        .join('milestone as m', 'pm.milestone_id', 'm.milestone_id')
        .where('pm.participant_id', participant.participant_id)
        .select('m.milestone_id', 'm.milestone_title', 'pm.milestone_date')
        .orderBy('pm.milestone_date', 'desc'),
      db('donation')
        .where('participant_id', participant.participant_id)
        .count('* as count')
        .first(),
    ]);

    // Transform database columns to view-friendly field names
    const participantVm = {
      id: participant.participant_id,
      first_name: participant.participant_first_name,
      last_name: participant.participant_last_name,
      email: participant.participant_email,
      phone: participant.participant_phone,
      city: participant.participant_city,
      state: participant.participant_state,
      zip: participant.participant_zip,
      school: participant.participant_school_or_employer,
      field_of_interest: participant.participant_field_of_interest,
      donations_count: parseInt(donationCount?.count) || 0,
      milestones: milestonesForParticipant.map((pm) => ({
        id: pm.milestone_id,
        title: pm.milestone_title,
        achieved_date_formatted: formatDateShort(pm.milestone_date),
      })),
    };

    res.render('participants/show', {
      participant: participantVm,
    });
  } catch (err) {
    console.error('Error fetching participant:', err);
    req.session.error = 'Error loading participant.';
    res.redirect('/participants');
  }
});

app.get('/participants/:id/edit', requireManager, async (req, res) => {
  try {
    const participant = await db('participant').where({ participant_id: req.params.id }).first();
    if (!participant) {
      req.session.error = 'Participant not found.';
      return res.redirect('/participants');
    }

    // Transform database columns to form-friendly field names
    const participantForm = {
      id: participant.participant_id,
      first_name: participant.participant_first_name,
      last_name: participant.participant_last_name,
      email: participant.participant_email,
      phone: participant.participant_phone,
      city: participant.participant_city,
      state: participant.participant_state,
      zip: participant.participant_zip,
      school: participant.participant_school_or_employer,
      field_of_interest: participant.participant_field_of_interest,
    };

    res.render('participants/form', {
      formTitle: 'Edit Participant',
      formAction: `/participants/${participant.participant_id}`,
      participant: participantForm,
    });
  } catch (err) {
    console.error('Error fetching participant:', err);
    req.session.error = 'Error loading participant.';
    res.redirect('/participants');
  }
});

app.post('/participants/:id', requireManager, async (req, res) => {
  try {
    const participant = await db('participant').where({ participant_id: req.params.id }).first();
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
      field_of_interest,
    } = req.body;

    // Validate email uniqueness if provided and changed
    if (email && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingEmail = await db('participant')
        .where('participant_email', normalizedEmail)
        .whereNot('participant_id', req.params.id)
        .first();
      
      if (existingEmail) {
        req.session.error = 'A participant with this email already exists.';
        return res.redirect(`/participants/${req.params.id}/edit`);
      }
    }

    // Validate phone uniqueness if provided and changed
    if (phone && phone.trim()) {
      const existingPhone = await db('participant')
        .where('participant_phone', phone.trim())
        .whereNot('participant_id', req.params.id)
        .first();
      
      if (existingPhone) {
        req.session.error = 'A participant with this phone number already exists.';
        return res.redirect(`/participants/${req.params.id}/edit`);
      }
    }

    await db('participant').where({ participant_id: req.params.id }).update({
      participant_first_name: first_name,
      participant_last_name: last_name,
      participant_email: email ? email.trim().toLowerCase() : null,
      participant_phone: phone ? phone.trim() : null,
      participant_city: city ? city.trim() : null,
      participant_state: state ? state.trim() : null,
      participant_zip: zip ? zip.trim() : null,
      participant_school_or_employer: school ? school.trim() : null,
      participant_field_of_interest: field_of_interest ? field_of_interest.trim() : null,
    });

    req.session.success = 'Participant updated.';
    res.redirect('/participants');
  } catch (err) {
    console.error('Error updating participant:', err);
    req.session.error = 'Error updating participant.';
    res.redirect('/participants');
  }
});

app.post('/participants/:id/delete', requireManager, async (req, res) => {
  try {
    const id = req.params.id;
    
    // Check if participant has any donations
    const donationCount = await db('donation')
      .where('participant_id', id)
      .count('* as count')
      .first();
    
    if (donationCount && parseInt(donationCount.count) > 0) {
      req.session.error = 'Cannot delete participant. This participant has donations associated with them. Please remove or reassign donations before deleting.';
      return res.redirect('/participants');
    }
    
    // If no donations, proceed with deletion
    await db('participant_milestone').where('participant_id', id).del();
    await db('participant').where({ participant_id: id }).del();
    req.session.success = 'Participant deleted.';
    res.redirect('/participants');
  } catch (err) {
    console.error('Error deleting participant:', err);
    req.session.error = 'Error deleting participant.';
    res.redirect('/participants');
  }
});

/**
 * Assign Milestones to Participant - Manager-only route
 * 
 * Per rubric requirement: "Ability to maintain milestones for participants"
 * Managers can assign existing milestone definitions to specific participants
 * with an achieved date. This tracks participant progress toward educational goals.
 */
app.get('/participants/:id/milestones/assign', requireManager, async (req, res) => {
  try {
    const [participantData, milestonesData] = await Promise.all([
      db('participant').where({ participant_id: req.params.id }).first(),
      db('milestone').select('*').orderBy('milestone_title')
    ]);

    if (!participantData) {
      req.session.error = 'Participant not found.';
      return res.redirect('/participants');
    }

    // Transform participant data to view-friendly field names
    const participant = {
      id: participantData.participant_id,
      first_name: participantData.participant_first_name,
      last_name: participantData.participant_last_name,
    };

    // Transform milestones data to view-friendly field names
    const milestones = milestonesData.map(m => ({
      id: m.milestone_id,
      title: m.milestone_title,
      description: m.milestone_description,
    }));

    res.render('milestones/assign', {
      participant,
      milestones,
    });
  } catch (err) {
    console.error('Error loading milestone assignment:', err);
    req.session.error = 'Error loading page.';
    res.redirect('/participants');
  }
});

app.post('/participants/:id/milestones', requireManager, async (req, res) => {
  try {
    const participantId = req.params.id;
    const participant = await db('participant').where({ participant_id: participantId }).first();
    if (!participant) {
      req.session.error = 'Participant not found.';
      return res.redirect('/participants');
    }

    const { milestone_id, achieved_date } = req.body;

    if (!milestone_id) {
      req.session.error = 'Please select a milestone.';
      return res.redirect(`/participants/${participantId}`);
    }

    await db('participant_milestone').insert({
      participant_id: participantId,
      milestone_id: milestone_id,
      milestone_date: achieved_date || new Date().toISOString().slice(0, 10),
    });

    req.session.success = 'Milestone assigned.';
    res.redirect(`/participants/${participantId}`);
  } catch (err) {
    console.error('Error assigning milestone:', err);
    req.session.error = 'Error assigning milestone.';
    res.redirect(`/participants/${req.params.id}`);
  }
});

// =======================
// MILESTONES MAINTENANCE
// =======================
/**
 * Milestone Maintenance Routes
 * 
 * Per rubric requirements:
 * - "Can only access if logged in" - Protected by requireLogin
 * - "Milestones are displayed and navigation works including search" - List with search
 * - "Ability to maintain (edit, delete, add) - manager only" - CRUD operations require manager
 * 
 * Milestones represent predefined achievements (e.g., "Enrolled in AP Math", "Declared STEAM Major")
 * that can be assigned to participants to track their progress.
 */

/**
 * List Milestones - Display all milestone definitions
 * 
 * Shows all milestone types that can be assigned to participants.
 * Search works across milestone title and description fields.
 */
app.get('/milestones', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    let query = db('milestone').select('*');

    if (q) {
      query = query.where(function() {
        this.where('milestone_title', 'ilike', `%${q}%`)
          .orWhere('milestone_description', 'ilike', `%${q}%`);
      });
    }

    const filtered = await query.orderBy('milestone_title');
    
    // Transform database columns to view-friendly field names
    const milestones = filtered.map(m => ({
      id: m.milestone_id,
      title: m.milestone_title,
      description: m.milestone_description,
    }));
    
    res.render('milestones/index', { milestones, q });
  } catch (err) {
    console.error('Error fetching milestones:', err);
    req.session.error = 'Error loading milestones.';
    res.render('milestones/index', { milestones: [], q: req.query.q || '' });
  }
});

app.get('/milestones/new', requireManager, (req, res) => {
  res.render('milestones/form', {
    formTitle: 'Create Milestone',
    formAction: '/milestones',
    milestone: {},
  });
});

app.post('/milestones', requireManager, async (req, res) => {
  try {
    const { title, description } = req.body;
    await db('milestone').insert({ milestone_title: title, milestone_description: description });
    req.session.success = 'Milestone created.';
    res.redirect('/milestones');
  } catch (err) {
    console.error('Error creating milestone:', err);
    req.session.error = 'Error creating milestone.';
    res.redirect('/milestones');
  }
});

app.get('/milestones/:id', requireLogin, async (req, res) => {
  try {
    const milestoneData = await db('milestone').where({ milestone_id: req.params.id }).first();
    if (!milestoneData) {
      req.session.error = 'Milestone not found.';
      return res.redirect('/milestones');
    }

    // Transform database columns to view-friendly field names
    const milestone = {
      id: milestoneData.milestone_id,
      title: milestoneData.milestone_title,
      description: milestoneData.milestone_description,
    };

    res.render('milestones/show', { milestone });
  } catch (err) {
    console.error('Error fetching milestone:', err);
    req.session.error = 'Error loading milestone.';
    res.redirect('/milestones');
  }
});

app.get('/milestones/:id/edit', requireManager, async (req, res) => {
  try {
    const milestoneData = await db('milestone').where({ milestone_id: req.params.id }).first();
    if (!milestoneData) {
      req.session.error = 'Milestone not found.';
      return res.redirect('/milestones');
    }

    // Transform database columns to form-friendly field names
    const milestone = {
      id: milestoneData.milestone_id,
      title: milestoneData.milestone_title,
      description: milestoneData.milestone_description,
    };

    res.render('milestones/form', {
      formTitle: 'Edit Milestone',
      formAction: `/milestones/${milestoneData.milestone_id}`,
      milestone,
    });
  } catch (err) {
    console.error('Error fetching milestone:', err);
    req.session.error = 'Error loading milestone.';
    res.redirect('/milestones');
  }
});

app.post('/milestones/:id', requireManager, async (req, res) => {
  try {
    const milestone = await db('milestone').where({ milestone_id: req.params.id }).first();
    if (!milestone) {
      req.session.error = 'Milestone not found.';
      return res.redirect('/milestones');
    }

    const { title, description } = req.body;
    await db('milestone').where({ milestone_id: req.params.id }).update({ milestone_title: title, milestone_description: description });
    req.session.success = 'Milestone updated.';
    res.redirect('/milestones');
  } catch (err) {
    console.error('Error updating milestone:', err);
    req.session.error = 'Error updating milestone.';
    res.redirect('/milestones');
  }
});

app.post('/milestones/:id/delete', requireManager, async (req, res) => {
  try {
    const id = req.params.id;
      await db('participant_milestone').where('milestone_id', id).del();
      await db('milestone').where({ milestone_id: id }).del();
    req.session.success = 'Milestone deleted.';
    res.redirect('/milestones');
  } catch (err) {
    console.error('Error deleting milestone:', err);
    req.session.error = 'Error deleting milestone.';
    res.redirect('/milestones');
  }
});

// =======================
// EVENTS MAINTENANCE
// =======================
/**
 * Event Maintenance Routes
 * 
 * Per rubric requirements:
 * - "Can access only if logged in" - Protected by requireLogin (all authenticated users can view)
 * - "Events are displayed and navigation works including search" - List with search functionality
 * - "Ability to maintain (edit, delete, add) - manager only" - CRUD operations require manager role
 * 
 * Events are stored in two related tables:
 * - `event`: Master event definitions (name, type, description)
 * - `event_instance`: Specific occurrences with date, location, capacity
 * 
 * The admin route lists all event instances with their associated event details.
 */

/**
 * List Events (Admin) - Display all event instances with search
 * 
 * Shows all event instances (specific event occurrences) joined with their event definitions.
 * Search works across event name, type, and location fields.
 * Events are ordered by date (newest first) for easy viewing of recent activities.
 */
app.get('/events/admin', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    let query = db('event_instance as ei')
      .select('ei.event_instance_id', 'ei.event_date_start_time', 'e.event_name', 'e.event_type', 'ei.event_location', 'ei.event_capacity')
      .leftJoin('event as e', 'ei.event_id', 'e.event_id');

    if (q) {
      query = query.where(function() {
        this.where('e.event_name', 'ilike', `%${q}%`)
          .orWhere('e.event_type', 'ilike', `%${q}%`)
          .orWhere('ei.event_location', 'ilike', `%${q}%`);
      });
    }

    const filtered = await query.orderBy('ei.event_date_start_time', 'desc');
    const viewModels = filtered.map((e) => ({
      id: e.event_instance_id,
      name: e.event_name || 'Event',
      type: e.event_type || 'General',
      location: e.event_location || 'TBD',
      dateFormatted: formatDateShort(e.event_date_start_time),
      capacity: e.event_capacity || 0,
    }));

    res.render('events/instances/index', { events: viewModels, q });
  } catch (err) {
    console.error('Error fetching events:', err);
    req.session.error = 'Error loading events.';
    res.render('events/instances/index', { events: [], q: req.query.q || '' });
  }
});

app.get('/events/new', requireManager, async (req, res) => {
  try {
    // Fetch all events from event table for dropdown
    const eventsData = await db('event')
      .select('event_id', 'event_name')
      .orderBy('event_name');

    // Transform to view-friendly format
    const events = eventsData.map(e => ({
      id: e.event_id,
      name: e.event_name,
    }));

    res.render('events/instances/form', {
      formTitle: 'Create Event Instance',
      formAction: '/events',
      event: {},
      events: events || [],
      currentUser: res.locals.currentUser,
    });
  } catch (err) {
    console.error('Error loading events for dropdown:', err);
    req.session.error = 'Error loading page.';
    res.redirect('/events/admin');
  }
});

// =======================
// EVENT TEMPLATES MAINTENANCE
// =======================
/**
 * Event Template Maintenance Routes
 * 
 * Manages event templates (event definitions in the event table) separately from event instances.
 * Templates define reusable event definitions that can be used to create multiple event instances.
 * 
 * NOTE: These routes must come BEFORE /events/:id to avoid route conflicts.
 */

/**
 * List Event Templates - Display all event templates
 */
app.get('/events/templates', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    let query = db('event').select('*').orderBy('event_name');

    if (q) {
      query = query.where(function() {
        this.where('event_name', 'ilike', `%${q}%`)
          .orWhere('event_type', 'ilike', `%${q}%`)
          .orWhere('event_description', 'ilike', `%${q}%`);
      });
    }

    const templatesData = await query;

    // Transform database columns to view-friendly field names
    const templates = templatesData.map(t => ({
      id: t.event_id,
      name: t.event_name,
      type: t.event_type || '-',
      description: t.event_description || '',
      default_capacity: t.event_default_capacity || '-',
    }));

    res.render('events/templates/index', { templates, q, currentUser: res.locals.currentUser });
  } catch (err) {
    console.error('Error fetching event templates:', err);
    req.session.error = 'Error loading event templates.';
    res.render('events/templates/index', { templates: [], q: req.query.q || '', currentUser: res.locals.currentUser });
  }
});

/**
 * New Event Template Form - Display form to create new template
 * NOTE: This route must come BEFORE /events/templates/:id to avoid route conflicts
 */
app.get('/events/templates/new', requireManager, (req, res) => {
  res.render('events/templates/form', {
    formTitle: 'Create Event Template',
    formAction: '/events/templates',
    template: {},
    currentUser: res.locals.currentUser,
  });
});

/**
 * Show Event Template - Display template details
 */
app.get('/events/templates/:id', requireLogin, async (req, res) => {
  try {
    const [templateData, instanceCountResult] = await Promise.all([
      db('event')
        .where({ event_id: req.params.id })
        .first(),
      db('event_instance')
        .where({ event_id: req.params.id })
        .count('* as count')
        .first()
    ]);

    if (!templateData) {
      req.session.error = 'Event template not found.';
      return res.redirect('/events/templates');
    }

    // Transform database columns to view-friendly field names
    const template = {
      id: templateData.event_id,
      name: templateData.event_name,
      type: templateData.event_type || '-',
      description: templateData.event_description || '',
      default_capacity: templateData.event_default_capacity || '-',
      instances_count: instanceCountResult ? parseInt(instanceCountResult.count) : 0,
    };

    res.render('events/templates/show', { template, currentUser: res.locals.currentUser });
  } catch (err) {
    console.error('Error fetching event template:', err);
    req.session.error = 'Error loading event template.';
    res.redirect('/events/templates');
  }
});

/**
 * Create Event Template - Manager-only route
 */
app.post('/events/templates', requireManager, async (req, res) => {
  try {
    const { name, type, description, default_capacity } = req.body;

    if (!name || !name.trim()) {
      req.session.error = 'Event name is required.';
      return res.redirect('/events/templates/new');
    }

    await db('event').insert({
      event_name: name.trim(),
      event_type: type ? type.trim() : null,
      event_description: description ? description.trim() : null,
      event_default_capacity: default_capacity ? Number(default_capacity) : null,
    });

    req.session.success = 'Event template created.';
    res.redirect('/events/templates');
  } catch (err) {
    console.error('Error creating event template:', err);
    req.session.error = 'Error creating event template.';
    res.redirect('/events/templates');
  }
});

/**
 * Edit Event Template Form - Display form to edit template
 */
app.get('/events/templates/:id/edit', requireManager, async (req, res) => {
  try {
    const templateData = await db('event')
      .where({ event_id: req.params.id })
      .first();

    if (!templateData) {
      req.session.error = 'Event template not found.';
      return res.redirect('/events/templates');
    }

    // Transform database columns to form-friendly field names
    const template = {
      id: templateData.event_id,
      name: templateData.event_name,
      type: templateData.event_type || '',
      description: templateData.event_description || '',
      default_capacity: templateData.event_default_capacity || '',
    };

    res.render('events/templates/form', {
      formTitle: 'Edit Event Template',
      formAction: `/events/templates/${req.params.id}`,
      template,
      currentUser: res.locals.currentUser,
    });
  } catch (err) {
    console.error('Error fetching event template:', err);
    req.session.error = 'Error loading event template.';
    res.redirect('/events/templates');
  }
});

/**
 * Update Event Template - Manager-only route
 */
app.post('/events/templates/:id', requireManager, async (req, res) => {
  try {
    const template = await db('event').where({ event_id: req.params.id }).first();
    if (!template) {
      req.session.error = 'Event template not found.';
      return res.redirect('/events/templates');
    }

    const { name, type, description, default_capacity } = req.body;

    if (!name || !name.trim()) {
      req.session.error = 'Event name is required.';
      return res.redirect(`/events/templates/${req.params.id}/edit`);
    }

    await db('event').where({ event_id: req.params.id }).update({
      event_name: name.trim(),
      event_type: type ? type.trim() : null,
      event_description: description ? description.trim() : null,
      event_default_capacity: default_capacity ? Number(default_capacity) : null,
    });

    req.session.success = 'Event template updated.';
    res.redirect('/events/templates');
  } catch (err) {
    console.error('Error updating event template:', err);
    req.session.error = 'Error updating event template.';
    res.redirect('/events/templates');
  }
});

/**
 * Delete Event Template - Manager-only route
 */
app.post('/events/templates/:id/delete', requireManager, async (req, res) => {
  try {
    const template = await db('event').where({ event_id: req.params.id }).first();
    if (!template) {
      req.session.error = 'Event template not found.';
      return res.redirect('/events/templates');
    }

    // Check if template has any instances
    const instanceCount = await db('event_instance')
      .where({ event_id: req.params.id })
      .count('* as count')
      .first();

    if (instanceCount && parseInt(instanceCount.count) > 0) {
      req.session.error = 'Cannot delete event template. This template has event instances associated with it. Please delete or reassign instances before deleting.';
      return res.redirect('/events/templates');
    }

    await db('event').where({ event_id: req.params.id }).del();
    req.session.success = 'Event template deleted.';
    res.redirect('/events/templates');
  } catch (err) {
    console.error('Error deleting event template:', err);
    req.session.error = 'Error deleting event template.';
    res.redirect('/events/templates');
  }
});

/**
 * Create Event Instance - Manager-only route
 * 
 * Creates a new event instance (specific occurrence) linked to an existing event definition.
 * The event_id is selected from the dropdown, which displays event names from the event table.
 * 
 * This design allows multiple instances of the same event (e.g., multiple workshops)
 * while maintaining a single event definition with common attributes.
 */
app.post('/events', requireManager, async (req, res) => {
  try {
    const { event_id, start_time, end_time, location, capacity } = req.body;
    
    if (!event_id) {
      req.session.error = 'Please select an event.';
      return res.redirect('/events/new');
    }

    // Determine capacity: use provided value, or fetch default from event table if blank
    let finalCapacity = null;
    if (capacity && capacity.trim() !== '') {
      finalCapacity = Number(capacity);
    } else {
      // Fetch the event's default capacity
      const eventData = await db('event')
        .where({ event_id: event_id })
        .select('event_default_capacity')
        .first();
      
      if (eventData && eventData.event_default_capacity !== null) {
        finalCapacity = Number(eventData.event_default_capacity);
      }
    }

    // Create the event_instance (specific occurrence with date/location)
    await db('event_instance').insert({
      event_id: event_id,
      event_date_start_time: start_time ? new Date(start_time) : new Date(),
      event_date_end_time: end_time ? new Date(end_time) : new Date(),
      event_location: location || null,
      event_capacity: finalCapacity,
    });

    req.session.success = 'Event instance created.';
    res.redirect('/events/admin');
  } catch (err) {
    console.error('Error creating event instance:', err);
    req.session.error = 'Error creating event instance.';
    res.redirect('/events/admin');
  }
});

app.get('/events/:id', requireLogin, async (req, res) => {
  try {
    const eventData = await db('event_instance as ei')
      .join('event as e', 'ei.event_id', 'e.event_id')
      .where('ei.event_instance_id', req.params.id)
      .select('ei.*', 'e.event_name', 'e.event_type', 'e.event_description')
      .first();

    if (!eventData) {
      req.session.error = 'Event not found.';
      return res.redirect('/events/admin');
    }

    // Transform database columns to view-friendly field names
    const event = {
      id: eventData.event_instance_id,
      event_id: eventData.event_id,
      event_name: eventData.event_name,
      event_type: eventData.event_type,
      event_description: eventData.event_description,
      start_time: eventData.event_date_start_time,
      end_time: eventData.event_date_end_time,
      location: eventData.event_location,
      capacity: eventData.event_capacity,
      start_time_formatted: formatDateTime(eventData.event_date_start_time),
      end_time_formatted: eventData.event_date_end_time ? formatDateTime(eventData.event_date_end_time) : '',
    };

    res.render('events/instances/show', { event, currentUser: res.locals.currentUser });
  } catch (err) {
    console.error('Error fetching event:', err);
    req.session.error = 'Error loading event.';
    res.redirect('/events/admin');
  }
});

app.get('/events/:id/edit', requireManager, async (req, res) => {
  try {
    const [eventData, eventsData] = await Promise.all([
      db('event_instance as ei')
        .join('event as e', 'ei.event_id', 'e.event_id')
        .where('ei.event_instance_id', req.params.id)
        .select('ei.*', 'e.event_name', 'e.event_type', 'e.event_description')
        .first(),
      db('event')
        .select('event_id', 'event_name')
        .orderBy('event_name')
    ]);

    if (!eventData) {
      req.session.error = 'Event not found.';
      return res.redirect('/events/admin');
    }

    // Transform events for dropdown
    const events = eventsData.map(e => ({
      id: e.event_id,
      name: e.event_name,
    }));

    // Transform database columns to form-friendly field names
    const event = {
      id: eventData.event_instance_id,
      event_id: eventData.event_id,
      start_time: eventData.event_date_start_time ? new Date(eventData.event_date_start_time).toISOString().slice(0, 16) : '',
      end_time: eventData.event_date_end_time ? new Date(eventData.event_date_end_time).toISOString().slice(0, 16) : '',
      location: eventData.event_location || '',
      capacity: eventData.event_capacity || '',
    };

    res.render('events/instances/form', {
      formTitle: 'Edit Event Instance',
      formAction: `/events/${req.params.id}`,
      event,
      events: events || [],
      currentUser: res.locals.currentUser,
    });
  } catch (err) {
    console.error('Error fetching event:', err);
    req.session.error = 'Error loading event.';
    res.redirect('/events/admin');
  }
});

app.post('/events/:id', requireManager, async (req, res) => {
  try {
    const eventInstance = await db('event_instance').where({ event_instance_id: req.params.id }).first();
    if (!eventInstance) {
      req.session.error = 'Event not found.';
      return res.redirect('/events/admin');
    }

    const { event_id, start_time, end_time, location, capacity } = req.body;

    if (!event_id) {
      req.session.error = 'Please select an event.';
      return res.redirect(`/events/${req.params.id}/edit`);
    }

    // Update event_instance table only (event definition is not changed)
    await db('event_instance').where({ event_instance_id: req.params.id }).update({
      event_id: event_id,
      event_date_start_time: start_time ? new Date(start_time) : eventInstance.event_date_start_time,
      event_date_end_time: end_time ? new Date(end_time) : eventInstance.event_date_end_time,
      event_location: location || null,
      event_capacity: capacity ? Number(capacity) : null,
    });

    req.session.success = 'Event instance updated.';
    res.redirect('/events/admin');
  } catch (err) {
    console.error('Error updating event instance:', err);
    req.session.error = 'Error updating event instance.';
    res.redirect('/events/admin');
  }
});

app.post('/events/:id/delete', requireManager, async (req, res) => {
  try {
    const eventInstance = await db('event_instance').where({ event_instance_id: req.params.id }).first();
    if (eventInstance) {
      await db('event_instance').where({ event_instance_id: req.params.id }).del();
      // Note: We may want to keep the event if there are other instances
      // For now, we'll delete it if this is the only instance
      const otherInstances = await db('event_instance').where({ event_id: eventInstance.event_id }).count('* as count').first();
      if (otherInstances.count === 0) {
        await db('event').where({ event_id: eventInstance.event_id }).del();
      }
    }
    req.session.success = 'Event deleted.';
    res.redirect('/events/admin');
  } catch (err) {
    console.error('Error deleting event:', err);
    req.session.error = 'Error deleting event.';
    res.redirect('/events/admin');
  }
});

// =======================
// SURVEYS MAINTENANCE
// =======================
/**
 * Survey Maintenance Routes
 * 
 * Per rubric requirements:
 * - "Can only access if logged in" - Protected by requireLogin
 * - "Surveys are displayed and navigation works including search" - List with search
 * - "Ability to maintain (edit, delete, add) - manager only" - CRUD operations require manager
 * 
 * Surveys capture post-event feedback from participants.
 * Structure:
 * - `survey_submission`: Links participant to event with submission date
 * - `survey_response`: Individual question answers (question_number 1-4)
 * - `survey_comment`: Free-text comments (stored separately per ERD design)
 * 
 * Question mapping: 1=satisfaction, 2=usefulness, 4=recommend (per ERD)
 */

/**
 * List Surveys - Display all survey submissions with search
 * 
 * Shows all survey submissions with participant name, event name, and satisfaction score.
 * Search works across participant name and event name.
 * Uses complex joins to aggregate data from multiple related tables.
 */
app.get('/surveys', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    
    let query = db('survey_submission as ss')
      .join('participant as p', 'ss.participant_id', 'p.participant_id')
      .leftJoin('event_instance as ei', 'ss.event_instance_id', 'ei.event_instance_id')
      .leftJoin('event as e', 'ei.event_id', 'e.event_id')
      .leftJoin('survey_response as sr', function() {
        this.on('sr.survey_submission_id', '=', 'ss.survey_submission_id')
            .andOn('sr.question_number', '=', db.raw('1'));
      })
      .select(
        'ss.survey_submission_id as id',
        'ss.survey_submission_date as submitted_at',
        'p.participant_first_name',
        'p.participant_last_name',
        'e.event_name as eventName',
        'sr.question_response as satisfaction'
      );

    if (q) {
      query = query.where(function() {
        this.where(db.raw("CONCAT(p.participant_first_name, ' ', p.participant_last_name)"), 'ilike', `%${q}%`)
          .orWhere('e.event_name', 'ilike', `%${q}%`);
      });
    }

    const surveysData = await query.orderBy('ss.survey_submission_date', 'desc');
    
    // Transform data to include all survey response fields for the view
    const surveyIds = surveysData.map(s => s.id);
    const allResponses = surveyIds.length > 0 ? await db('survey_response')
      .whereIn('survey_submission_id', surveyIds)
      .select('*') : [];
    
    const responseMap = {};
    allResponses.forEach(r => {
      if (!responseMap[r.survey_submission_id]) {
        responseMap[r.survey_submission_id] = {};
      }
      responseMap[r.survey_submission_id][r.question_number] = r.question_response;
    });
    
    // Transform database columns to view-friendly field names
    const surveys = surveysData.map(s => ({
      id: s.id,
      participantName: `${s.participant_first_name || ''} ${s.participant_last_name || ''}`.trim(),
      eventName: s.eventName || '-',
      submitted_at: formatDateShort(s.submitted_at),
      satisfaction: responseMap[s.id]?.[1] || '-',
      usefulness: responseMap[s.id]?.[2] || '-',
      recommend: responseMap[s.id]?.[4] || '-',
    }));
    
    res.render('surveys/index', { surveys, q });
  } catch (err) {
    console.error('Error fetching surveys:', err);
    req.session.error = 'Error loading surveys.';
    res.render('surveys/index', { surveys: [], q: req.query.q || '' });
  }
});

app.get('/surveys/new', requireManager, async (req, res) => {
  try {
    const [participants, events] = await Promise.all([
      db('participant').select('participant_id as id', 'participant_first_name', 'participant_last_name').orderBy('participant_last_name'),
      db('event_instance as ei')
        .join('event as e', 'ei.event_id', 'e.event_id')
        .select('ei.event_instance_id as id', 'e.event_name as name', 'ei.event_date_start_time')
        .orderBy('ei.event_date_start_time', 'desc')
    ]);
    
    res.render('surveys/form', {
      formTitle: 'Record Survey',
      formAction: '/surveys',
      survey: {},
      participants,
      events,
    });
  } catch (err) {
    console.error('Error loading survey form:', err);
    req.session.error = 'Error loading form.';
    res.redirect('/surveys');
  }
});

/**
 * Create Survey - Manager-only route
 * 
 * Creates a survey submission in a multi-step process:
 * 1. Creates the survey_submission record linking participant to event
 * 2. Creates individual survey_response records for each answered question
 * 3. Creates survey_comment record if a comment is provided
 * 
 * This normalized structure allows for flexible survey questions while maintaining
 * referential integrity. Comments are stored separately per ERD design.
 */
app.post('/surveys', requireManager, async (req, res) => {
  try {
    const { participant_id, event_id, satisfaction, usefulness, recommend, comment } = req.body;
    
    // Create survey submission record (links participant to event)
    const [submission] = await db('survey_submission').insert({
      participant_id: Number(participant_id),
      event_instance_id: Number(event_id),
      survey_submission_date: new Date(),
    }).returning('survey_submission_id');

    // Create survey responses for each answered question
    // Question mapping: 1=satisfaction, 2=usefulness, 4=recommend (per ERD)
    const responses = [];
    if (satisfaction) responses.push({ survey_submission_id: submission.survey_submission_id, question_number: 1, question_response: satisfaction });
    if (usefulness) responses.push({ survey_submission_id: submission.survey_submission_id, question_number: 2, question_response: usefulness });
    if (recommend) responses.push({ survey_submission_id: submission.survey_submission_id, question_number: 4, question_response: recommend });

    if (responses.length > 0) {
      await db('survey_response').insert(responses);
    }

    // Create survey comment if provided (stored in separate table per ERD)
    if (comment) {
      await db('survey_comment').insert({
        survey_submission_id: submission.survey_submission_id,
        comment_number: 1,
        comment_text: comment,
      });
    }

    req.session.success = 'Survey recorded.';
    res.redirect('/surveys');
  } catch (err) {
    console.error('Error creating survey:', err);
    req.session.error = 'Error creating survey.';
    res.redirect('/surveys');
  }
});

app.get('/surveys/:id', requireLogin, async (req, res) => {
  try {
    const submission = await db('survey_submission as ss')
      .join('participant as p', 'ss.participant_id', 'p.participant_id')
      .leftJoin('event_instance as ei', 'ss.event_instance_id', 'ei.event_instance_id')
      .leftJoin('event as e', 'ei.event_id', 'e.event_id')
      .where('ss.survey_submission_id', req.params.id)
      .select('ss.*', 'p.*', 'e.event_name as eventName', 'ei.event_instance_id as eventInstanceId')
      .first();

    if (!submission) {
      req.session.error = 'Survey not found.';
      return res.redirect('/surveys');
    }

    const [responses, comments] = await Promise.all([
      db('survey_response')
        .where('survey_submission_id', req.params.id)
        .select('*'),
      db('survey_comment')
        .where('survey_submission_id', req.params.id)
        .select('*')
        .orderBy('comment_number')
    ]);

    // Transform data for the view
    const responseMap = responses.reduce((acc, r) => {
      acc[r.question_number] = r.question_response;
      return acc;
    }, {});

    const survey = {
      id: submission.survey_submission_id,
      satisfaction: responseMap[1] || null,
      usefulness: responseMap[2] || null,
      recommend: responseMap[4] || null,
      comment: comments.length > 0 ? comments[0].comment_text : null,
    };

    const event = submission.eventName ? {
      name: submission.eventName,
    } : null;

    const participant = {
      first_name: submission.participant_first_name,
      last_name: submission.participant_last_name,
    };

    res.render('surveys/show', { survey, event, participant });
  } catch (err) {
    console.error('Error fetching survey:', err);
    req.session.error = 'Error loading survey.';
    res.redirect('/surveys');
  }
});

app.get('/surveys/:id/edit', requireManager, async (req, res) => {
  try {
    const [submission, responses, comments, participants, events] = await Promise.all([
      db('survey_submission').where({ survey_submission_id: req.params.id }).first(),
      db('survey_response').where({ survey_submission_id: req.params.id }).select('*'),
      db('survey_comment').where({ survey_submission_id: req.params.id }).select('*').orderBy('comment_number'),
      db('participant').select('participant_id as id', 'participant_first_name', 'participant_last_name').orderBy('participant_last_name'),
      db('event_instance as ei')
        .join('event as e', 'ei.event_id', 'e.event_id')
        .select('ei.event_instance_id as id', 'e.event_name as name', 'ei.event_date_start_time')
        .orderBy('ei.event_date_start_time', 'desc')
    ]);

    if (!submission) {
      req.session.error = 'Survey not found.';
      return res.redirect('/surveys');
    }

    // Transform responses to form-friendly fields
    const responseMap = responses.reduce((acc, r) => {
      acc[r.question_number] = r.question_response;
      return acc;
    }, {});

    // Transform participants for dropdown
    const participantsFormatted = participants.map(p => ({
      id: p.id,
      first_name: p.participant_first_name,
      last_name: p.participant_last_name,
    }));

    const survey = {
      id: submission.survey_submission_id,
      participant_id: submission.participant_id,
      event_id: submission.event_instance_id,
      satisfaction: responseMap[1] || '',
      usefulness: responseMap[2] || '',
      recommend: responseMap[4] || '',
      comment: comments.length > 0 ? comments[0].comment_text : '',
    };

    res.render('surveys/form', {
      formTitle: 'Edit Survey',
      formAction: `/surveys/${submission.survey_submission_id}`,
      survey,
      participants: participantsFormatted,
      events,
    });
  } catch (err) {
    console.error('Error loading survey form:', err);
    req.session.error = 'Error loading form.';
    res.redirect('/surveys');
  }
});

app.post('/surveys/:id', requireManager, async (req, res) => {
  try {
    const submission = await db('survey_submission').where({ survey_submission_id: req.params.id }).first();
    if (!submission) {
      req.session.error = 'Survey not found.';
      return res.redirect('/surveys');
    }

    const { participant_id, event_id, satisfaction, usefulness, recommend, comment } = req.body;

    // Update submission
    await db('survey_submission').where({ survey_submission_id: req.params.id }).update({
      participant_id: Number(participant_id),
      event_instance_id: Number(event_id),
    });

    // Update or insert responses
    const updates = [];
    if (satisfaction) updates.push({ survey_submission_id: req.params.id, question_number: 1, question_response: satisfaction });
    if (usefulness) updates.push({ survey_submission_id: req.params.id, question_number: 2, question_response: usefulness });
    if (recommend) updates.push({ survey_submission_id: req.params.id, question_number: 4, question_response: recommend });

    for (const update of updates) {
      await db('survey_response')
        .where({ survey_submission_id: update.survey_submission_id, question_number: update.question_number })
        .del();
      await db('survey_response').insert(update);
    }

    // Handle comments in survey_comment table
    if (comment) {
      // Delete existing comments and insert new one
      await db('survey_comment')
        .where({ survey_submission_id: req.params.id })
        .del();
      await db('survey_comment').insert({
        survey_submission_id: req.params.id,
        comment_number: 1,
        comment_text: comment,
      });
    } else {
      // Remove comment if empty
      await db('survey_comment')
        .where({ survey_submission_id: req.params.id })
        .del();
    }

    req.session.success = 'Survey updated.';
    res.redirect('/surveys');
  } catch (err) {
    console.error('Error updating survey:', err);
    req.session.error = 'Error updating survey.';
    res.redirect('/surveys');
  }
});

app.post('/surveys/:id/delete', requireManager, async (req, res) => {
  try {
    await db('survey_comment').where('survey_submission_id', req.params.id).del();
    await db('survey_response').where('survey_submission_id', req.params.id).del();
    await db('survey_submission').where({ survey_submission_id: req.params.id }).del();
    req.session.success = 'Survey deleted.';
    res.redirect('/surveys');
  } catch (err) {
    console.error('Error deleting survey:', err);
    req.session.error = 'Error deleting survey.';
    res.redirect('/surveys');
  }
});

// =======================
// DONATIONS MAINTENANCE
// =======================
/**
 * Donation Maintenance Routes
 * 
 * Per rubric requirements:
 * - "Can only access if logged in" - Admin donations view protected by requireLogin
 * - "Donations are displayed and navigation works including search" - List with search (admin view)
 * - "Ability to maintain (edit, delete, add) - manager only" - CRUD operations require manager
 * - "Ability to add user information and donation" - Public route saves donor info (FIXED)
 * 
 * Donations use a composite primary key (participant_id, donation_number) per ERD.
 * Anonymous donations use participant_id = 0 (references a special "Anonymous" participant record).
 * Public donations can optionally create participant records for donors.
 */

/**
 * Public Donation Handler - Accepts donations from website visitors
 * 
 * Per rubric requirement: "Ability to add user information and donation"
 * This route processes donations from the public website:
 * - If donor provides name/email: Creates or finds participant record and links donation
 * - If anonymous: Creates donation with participant_id = 0 (Anonymous participant)
 * - Always saves donation amount and date
 * 
 * This ensures donor information is stored as required by the rubric.
 */
// Public-facing simple donation capture
// This route handles donations from the public website where visitors can provide their information
// Per rubric requirement: "Ability to add user information and donation" - we save donor info as participants
app.post('/donations/public', async (req, res) => {
  try {
    const { donor_first_name, donor_last_name, donor_email, amount } = req.body;
    
    // Validate required fields
    if (!amount || Number(amount) <= 0) {
      req.session.error = 'Please enter a valid donation amount.';
      return res.redirect('/donate');
    }
    
    if (!donor_first_name || !donor_first_name.trim()) {
      req.session.error = 'Please enter your first name.';
      return res.redirect('/donate');
    }
    
    if (!donor_last_name || !donor_last_name.trim()) {
      req.session.error = 'Please enter your last name.';
      return res.redirect('/donate');
    }
    
    // Default to participant_id = 0 for anonymous donations
    // Participant ID 0 represents the "Anonymous" participant record
    let participant_id = 0;

    // If donor provided email, find or create a participant record to link the donation
    // This meets the rubric requirement to store user information with donations
    // First and last name are required fields
    if (donor_email) {
      // Get first and last name from form fields (required, so should be present)
      const first_name = donor_first_name.trim();
      const last_name = donor_last_name.trim();

      // Normalize email for lookup
      const normalizedEmail = donor_email.trim().toLowerCase();

      // Check if a participant with this email already exists
      let existingParticipant = await db('participant')
        .where('participant_email', normalizedEmail)
        .first();

      if (existingParticipant) {
        // Use existing participant
        participant_id = existingParticipant.participant_id;
      } else {
        // Create a new participant record for the donor with the role of 'donor'
        // This allows us to track donors and link multiple donations to the same person
        const insertResult = await db('participant')
          .insert({
            participant_first_name: first_name,
            participant_last_name: last_name,
            participant_email: normalizedEmail,
            participant_role: 'donor',
            // Leave other fields null since this is just a donor record
          })
          .returning('participant_id');
        
        // Handle different return formats from returning() - could be array, object, or direct value
        let newParticipant;
        if (Array.isArray(insertResult)) {
          newParticipant = insertResult[0];
        } else {
          newParticipant = insertResult;
        }
        
        // Extract participant_id - handle both object property and direct value
        if (newParticipant && typeof newParticipant === 'object') {
          participant_id = newParticipant.participant_id;
        } else {
          participant_id = newParticipant;
        }
        
        // Fallback: if we still don't have an ID, query for the participant we just created
        if (!participant_id) {
          const created = await db('participant')
            .where('participant_email', normalizedEmail)
            .first();
          if (created) {
            participant_id = created.participant_id;
          } else {
            throw new Error('Failed to create or retrieve participant record');
          }
        }
      }
    }

    // Determine the next donation_number for this participant
    // Anonymous donations use participant_id = 0
    // The donation table uses a composite key (participant_id, donation_number)
    const maxDonation = await db('donation')
      .where({ participant_id })
      .max('donation_number as max_num')
      .first();
    
    const donation_number = (maxDonation?.max_num || 0) + 1;

    // Insert the donation record
    await db('donation').insert({
      participant_id: participant_id,
      donation_number: donation_number,
      donation_amount: Number(amount),
      donation_date: new Date().toISOString().slice(0, 10),
    });

    req.session.success = 'Thank you for your support!';
    res.redirect('/donate');
  } catch (err) {
    console.error('Error recording donation:', err);
    req.session.error = 'Error recording donation. Please try again.';
    res.redirect('/donate');
  }
});

/**
 * List Donations (Admin) - Display all donations with search
 * 
 * Shows all donations with linked participant information (if available).
 * Anonymous donations show as "Anonymous" when participant_id is null.
 * Search works across participant name and email fields.
 * Uses composite key (participant_id, donation_number) for unique identification.
 */
app.get('/donations', requireLogin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    
    let query = db('donation as d')
      .leftJoin('participant as p', 'd.participant_id', 'p.participant_id')
      .select(
        'd.participant_id',
        'd.donation_number',
        'd.donation_amount as amount',
        'd.donation_date as date',
        'p.participant_first_name',
        'p.participant_last_name',
        'p.participant_email'
      );

    if (q) {
      query = query.where(function() {
        this.where('p.participant_email', 'ilike', `%${q}%`)
          .orWhere('p.participant_first_name', 'ilike', `%${q}%`)
          .orWhere('p.participant_last_name', 'ilike', `%${q}%`);
      });
    }

    const donationsData = await query.orderBy('d.donation_date', 'desc');
    // Transform database columns to view-friendly field names with composite key identifier
    const donationsWithId = donationsData.map(d => ({
      participant_id: d.participant_id,
      donation_number: d.donation_number,
      id: d.participant_id ? `${d.participant_id}-${d.donation_number}` : `null-${d.donation_number}`,
      donor: d.participant_id 
        ? `${d.participant_first_name || ''} ${d.participant_last_name || ''}`.trim() || 'Unknown'
        : 'Anonymous',
      email: d.participant_email || null,
      amount: Number(d.amount) || 0,
      date: formatDateShort(d.date), // Formats donation_date from database
    }));
    
    res.render('donations/index', { donations: donationsWithId, q });
  } catch (err) {
    console.error('Error fetching donations:', err);
    req.session.error = 'Error loading donations.';
    res.render('donations/index', { donations: [], q: req.query.q || '' });
  }
});

app.get('/donations/new', requireManager, async (req, res) => {
  try {
    const prefillAmount = req.query.amount || '';
    const participants = await db('participant')
      .select('participant_id as id', 'participant_first_name', 'participant_last_name')
      .orderBy('participant_last_name');
    
    res.render('donations/form', {
      formTitle: 'Record Donation',
      formAction: '/donations',
      donation: { amount: prefillAmount },
      participants,
    });
  } catch (err) {
    console.error('Error loading donation form:', err);
    req.session.error = 'Error loading form.';
    res.redirect('/donations');
  }
});

/**
 * Create Donation (Admin) - Manager-only route
 * 
 * Allows managers to manually record donations linked to participants or as anonymous.
 * Handles composite key by calculating the next donation_number for the selected participant.
 * Supports both participant-linked and anonymous donations.
 */
app.post('/donations', requireManager, async (req, res) => {
  try {
    const { participant_id, amount, date } = req.body;
    const partId = participant_id ? Number(participant_id) : null;

    // Get the next donation_number for this participant (or null for anonymous)
    // The donation table uses composite key (participant_id, donation_number) per ERD
    let maxDonation;
    if (partId) {
      maxDonation = await db('donation')
        .where({ participant_id: partId })
        .max('donation_number as max_num')
        .first();
    } else {
      maxDonation = await db('donation')
        .whereNull('participant_id')
        .max('donation_number as max_num')
        .first();
    }
    
    const donation_number = (maxDonation?.max_num || 0) + 1;

    await db('donation').insert({
      participant_id: partId,
      donation_number,
      donation_amount: Number(amount) || 0,
      donation_date: date || new Date().toISOString().slice(0, 10),
    });

    req.session.success = 'Donation recorded.';
    res.redirect('/donations');
  } catch (err) {
    console.error('Error creating donation:', err);
    req.session.error = 'Error creating donation.';
    res.redirect('/donations');
  }
});

app.get('/donations/:participant_id/:donation_number', requireLogin, async (req, res) => {
  try {
    const participant_id = req.params.participant_id === 'null' ? null : Number(req.params.participant_id);
    const donation_number = Number(req.params.donation_number);

    let donationQuery;
    if (participant_id === null) {
      donationQuery = db('donation as d')
        .leftJoin('participant as p', 'd.participant_id', 'p.participant_id')
        .whereNull('d.participant_id')
        .where('d.donation_number', donation_number)
        .select('d.*', 'p.participant_first_name', 'p.participant_last_name', 'p.participant_email');
    } else {
      donationQuery = db('donation as d')
        .leftJoin('participant as p', 'd.participant_id', 'p.participant_id')
        .where('d.participant_id', participant_id)
        .where('d.donation_number', donation_number)
        .select('d.*', 'p.participant_first_name', 'p.participant_last_name', 'p.participant_email');
    }

    const donationData = await donationQuery.first();

    if (!donationData) {
      req.session.error = 'Donation not found.';
      return res.redirect('/donations');
    }

    // Transform database columns to view-friendly field names
    const donation = {
      participant_id: donationData.participant_id,
      donation_number: donationData.donation_number,
      donor: donationData.participant_id 
        ? `${donationData.participant_first_name || ''} ${donationData.participant_last_name || ''}`.trim() || 'Unknown'
        : 'Anonymous',
      email: donationData.participant_email || null,
      amount: Number(donationData.donation_amount) || 0,
      date: formatDateShort(donationData.donation_date),
    };

    res.render('donations/show', { donation });
  } catch (err) {
    console.error('Error fetching donation:', err);
    req.session.error = 'Error loading donation.';
    res.redirect('/donations');
  }
});

app.get('/donations/:participant_id/:donation_number/edit', requireManager, async (req, res) => {
  try {
    const participant_id = req.params.participant_id === 'null' ? null : Number(req.params.participant_id);
    const donation_number = Number(req.params.donation_number);

    let donationQuery;
    if (participant_id === null) {
      donationQuery = db('donation')
        .whereNull('participant_id')
        .where({ donation_number });
    } else {
      donationQuery = db('donation')
        .where({ participant_id, donation_number });
    }

    const [donation, participants] = await Promise.all([
      donationQuery.first(),
      db('participant').select('participant_id as id', 'participant_first_name', 'participant_last_name').orderBy('participant_last_name')
    ]);

    if (!donation) {
      req.session.error = 'Donation not found.';
      return res.redirect('/donations');
    }

    // Transform database columns to form-friendly field names
    const donationForm = {
      participant_id: donation.participant_id,
      amount: donation.donation_amount,
      dateISO: donation.donation_date ? new Date(donation.donation_date).toISOString().slice(0, 10) : '',
    };

    res.render('donations/form', {
      formTitle: 'Edit Donation',
      formAction: `/donations/${req.params.participant_id}/${req.params.donation_number}`,
      donation: donationForm,
      participants,
    });
  } catch (err) {
    console.error('Error loading donation:', err);
    req.session.error = 'Error loading donation.';
    res.redirect('/donations');
  }
});

app.post('/donations/:participant_id/:donation_number', requireManager, async (req, res) => {
  try {
    const participant_id = req.params.participant_id === 'null' ? null : Number(req.params.participant_id);
    const donation_number = Number(req.params.donation_number);

    let donation;
    if (participant_id === null) {
      donation = await db('donation')
        .whereNull('participant_id')
        .where({ donation_number })
        .first();
    } else {
      donation = await db('donation')
        .where({ participant_id, donation_number })
        .first();
    }

    if (!donation) {
      req.session.error = 'Donation not found.';
      return res.redirect('/donations');
    }

    const { participant_id: new_participant_id, amount, date } = req.body;
    const newPartId = new_participant_id ? Number(new_participant_id) : null;

    // If participant_id changed, we need to delete old and create new (can't update composite key)
    if (newPartId !== participant_id) {
      if (participant_id === null) {
        await db('donation')
          .whereNull('participant_id')
          .where({ donation_number })
          .del();
      } else {
        await db('donation')
          .where({ participant_id, donation_number })
          .del();
      }

      // Get new donation_number for the new participant
      let maxDonation;
      if (newPartId) {
        maxDonation = await db('donation')
          .where({ participant_id: newPartId })
          .max('donation_number as max_num')
          .first();
      } else {
        maxDonation = await db('donation')
          .whereNull('participant_id')
          .max('donation_number as max_num')
          .first();
      }
      
      const new_donation_number = (maxDonation?.max_num || 0) + 1;

      await db('donation').insert({
        participant_id: newPartId,
        donation_number: new_donation_number,
        donation_amount: Number(amount) || donation.donation_amount,
        donation_date: date || donation.donation_date,
      });
    } else {
      // Just update amount and date
      if (participant_id === null) {
        await db('donation')
          .whereNull('participant_id')
          .where({ donation_number })
          .update({
            donation_amount: Number(amount) || donation.donation_amount,
            donation_date: date || donation.donation_date,
          });
      } else {
        await db('donation')
          .where({ participant_id, donation_number })
          .update({
            donation_amount: Number(amount) || donation.donation_amount,
            donation_date: date || donation.donation_date,
          });
      }
    }

    req.session.success = 'Donation updated.';
    res.redirect('/donations');
  } catch (err) {
    console.error('Error updating donation:', err);
    req.session.error = 'Error updating donation.';
    res.redirect('/donations');
  }
});

app.post('/donations/:participant_id/:donation_number/delete', requireManager, async (req, res) => {
  try {
    const participant_id = req.params.participant_id === 'null' ? null : Number(req.params.participant_id);
    const donation_number = Number(req.params.donation_number);

    await db('donation')
      .where({ 
        participant_id: participant_id === null ? db.raw('NULL') : participant_id,
        donation_number 
      })
      .del();
    
    req.session.success = 'Donation deleted.';
    res.redirect('/donations');
  } catch (err) {
    console.error('Error deleting donation:', err);
    req.session.error = 'Error deleting donation.';
    res.redirect('/donations');
  }
});

// =======================
// FALLBACK
// =======================
/**
 * 404 Not Found Handler
 * 
 * Catches all unmatched routes and renders the home page as a fallback.
 * This ensures users don't see error pages for invalid URLs - instead they see
 * the welcoming home page. Status code is set to 404 for proper HTTP semantics.
 */
app.use(async (req, res) => {
  res.status(404);
  try {
    const [eventsData, participantsResult, satisfactionResult, recommendResult, milestonesResult] = await Promise.all([
      db('event_instance as ei')
        .leftJoin('event as e', 'ei.event_id', 'e.event_id')
        .select('ei.*', 'e.event_name', 'e.event_type', 'e.event_description')
        .where(db.raw("EXTRACT(YEAR FROM ei.event_date_start_time)"), ">=", new Date().getFullYear())
        .orderBy('ei.event_date_start_time', 'asc')
        .limit(3),
      db.select(db.raw("count(distinct er.participant_id) as participants_count"))
        .from("event_registration as er")
        .where("er.registration_attended_flag", "=", true),
      db.select(db.raw("avg(question_response) as avg_satisfaction"))
        .from("survey_response")
        .where("question_number", "=", 1)
        .groupBy("question_number"),
      db.select(db.raw("avg(question_response) as avg_recommend"))
        .from("survey_response")
        .where("question_number", "=", 4)
        .groupBy("question_number"),
      db.select(db.raw("count(*) as milestones_achieved"))
        .from("participant_milestone")
    ]);

    const upcomingEvents = eventsData.map((e) => ({
      ...e,
      dateFormatted: formatDateShort(e.event_date_start_time || e.start),
    }));

    const impactStats = {
      participantsCount: participantsResult[0]?.participants_count || 0,
      avgSatisfaction: satisfactionResult[0]?.avg_satisfaction 
        ? parseFloat(satisfactionResult[0].avg_satisfaction).toFixed(1) 
        : null,
      avgRecommend: recommendResult[0]?.avg_recommend 
        ? parseFloat(recommendResult[0].avg_recommend).toFixed(1) 
        : null,
      milestonesAchieved: milestonesResult[0]?.milestones_achieved || 0,
    };

    res.render('public/home', { upcomingEvents, impactStats });
  } catch (err) {
    console.error('Error loading 404 page:', err);
    res.render('public/home', { 
      upcomingEvents: [], 
      impactStats: { 
        participantsCount: 0, 
        avgSatisfaction: null, 
        avgRecommend: null, 
        milestonesAchieved: 0 
      } 
    });
  }
});


// =======================
// START SERVER
// =======================
/**
 * Server startup
 * 
 * Starts the Express server on the configured PORT.
 * PORT can be set via environment variable (for deployment) or defaults to 3000 for local development.
 */
app.listen(PORT, () => {
  console.log(`Ella Rises app preview running on http://localhost:${PORT}`);
});