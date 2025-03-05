const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs'); // For password hashing
const path = require('path');
const axios = require('axios'); // For making HTTP requests
const { OpenAI } = require('openai'); // For ChatGPT integration

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB connection string (from .env file)
const uri = process.env.MONGODB_URI; // Ensure this is set in your .env file
const client = new MongoClient(uri);

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3002'], // Allow requests from both origins
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(bodyParser.json());

// Serve static files from the "public" directory
app.use(express.static('public'));

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Connect to MongoDB
let db;
async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db('healthconnect'); // Replace with your database name
    console.log('Database:', db.databaseName);
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(col => col.name));
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}
connectToMongoDB();

// Route for the root URL
app.get('/', (req, res) => {
  res.send('Welcome to the HealthConnect Backend Server!');
});

// Chatbot responses (initial static responses)
const responses = {
  "hello": "Hello! Welcome to HealthConnect. How can I assist you today?",
  "hi": "Hi there! How can I help you?",
  "workout splits": "Here are some popular workout splits:\n1. **Full Body (3 days/week)**: Work all major muscle groups in each session.\n2. **Upper/Lower (4 days/week)**: Alternate between upper and lower body workouts.\n3. **Push/Pull/Legs (6 days/week)**: Focus on pushing, pulling, and leg exercises.\nWhich one are you interested in?",
  "diet plans": "Here are some diet plans based on your goal:\n1. **Weight Loss**: High-protein, low-carb, and calorie-deficit meals.\n2. **Muscle Gain**: High-protein, moderate-carb, and calorie-surplus meals.\n3. **Vegetarian**: Plant-based protein sources like beans, lentils, and tofu.\nWhat's your goal?",
  "fitness advice": "Here are some general fitness tips:\n1. **Workout Frequency**: 3-5 times per week for optimal results.\n2. **Build Muscle**: Focus on progressive overload and proper nutrition.\n3. **Improve Cardio**: Incorporate HIIT or steady-state cardio into your routine.\nDo you have a specific question?",
  "default": "I'm sorry, I didn't understand that. Can you please rephrase or ask something else?"
};

// Function to fetch response from ChatGPT (OpenAI API)
async function fetchChatGPTResponse(query) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Ensure you have set OPENAI_API_KEY in your .env file
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // or 'gpt-4'
      messages: [{ role: 'user', content: query }],
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error fetching response from ChatGPT:', error);
    throw error;
  }
}

// Endpoint to handle chatbot queries
app.post('/chat', async (req, res) => {
  console.log('Received request to /chat');
  console.log('Request body:', req.body);

  const userMessage = req.body.message.toLowerCase();
  let botResponse = responses.default;

  // Check if the message matches any predefined responses
  for (const key in responses) {
    if (userMessage.includes(key)) {
      botResponse = responses[key];
      break;
    }
  }

  // If no predefined response matches, fetch information from ChatGPT
  if (botResponse === responses.default) {
    try {
      botResponse = await fetchChatGPTResponse(userMessage);
    } catch (error) {
      console.error('Error fetching response from ChatGPT:', error);
      botResponse = "Sorry, I couldn't fetch the information at the moment. Please try again later.";
    }
  }

  // Save the conversation to MongoDB for future learning
  try {
    const conversation = { userMessage, botResponse, timestamp: new Date() };
    await db.collection('chatHistory').insertOne(conversation);
    console.log('Conversation saved to MongoDB:', conversation);
  } catch (error) {
    console.error('Error saving conversation to MongoDB:', error);
  }

  res.json({ message: botResponse });
});

// Route to handle newsletter subscriptions
app.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the email already exists
    const existingSubscription = await db.collection('subscriptions').findOne({ email });
    if (existingSubscription) {
      return res.status(400).json({ success: false, message: 'Email already subscribed.' });
    }

    // Save the email to the database
    const newSubscription = { email, createdAt: new Date() };
    const result = await db.collection('subscriptions').insertOne(newSubscription);
    console.log('Subscription saved:', result.insertedId);

    res.status(201).json({ success: true, message: 'Thank you for subscribing!' });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// Route to handle Transform form submission
app.post('/send-diet-plan', async (req, res) => {
  console.log('Received request to /send-diet-plan');
  const { name, email, goal, height, weight, exerciseLevel, dietPreference } = req.body;
  console.log('Request body:', req.body);

  // Generate a detailed diet plan based on the goal and diet preference
  let dietPlan = '';
  switch (goal) {
    case 'weight_loss':
      if (dietPreference === 'vegetarian') {
        dietPlan = `
          <h2>Vegetarian Weight Loss Diet Plan</h2>
          <ul>
            <li><strong>7:00 AM - Breakfast:</strong> Oatmeal with fruits and a handful of nuts</li>
            <li><strong>10:00 AM - Snack:</strong> Greek yogurt with honey</li>
            <li><strong>1:00 PM - Lunch:</strong> Quinoa salad with mixed vegetables and a side of avocado</li>
            <li><strong>4:00 PM - Snack:</strong> A small apple or a handful of almonds</li>
            <li><strong>7:00 PM - Dinner:</strong> Steamed vegetables with tofu and a small portion of brown rice</li>
            <li><strong>9:00 PM - Snack (optional):</strong> A glass of warm skim milk</li>
          </ul>
        `;
      } else {
        dietPlan = `
          <h2>Non-Vegetarian Weight Loss Diet Plan</h2>
          <ul>
            <li><strong>7:00 AM - Breakfast:</strong> Scrambled eggs with spinach and whole-grain toast</li>
            <li><strong>10:00 AM - Snack:</strong> A boiled egg or a handful of nuts</li>
            <li><strong>1:00 PM - Lunch:</strong> Grilled chicken breast with a side of steamed broccoli and quinoa</li>
            <li><strong>4:00 PM - Snack:</strong> A small apple or a handful of almonds</li>
            <li><strong>7:00 PM - Dinner:</strong> Grilled fish with a side of roasted vegetables</li>
            <li><strong>9:00 PM - Snack (optional):</strong> A glass of warm skim milk</li>
          </ul>
        `;
      }
      break;
    case 'muscle_gain':
      if (dietPreference === 'vegetarian') {
        dietPlan = `
          <h2>Vegetarian Muscle Gain Diet Plan</h2>
          <ul>
            <li><strong>7:00 AM - Breakfast:</strong> Smoothie with banana, spinach, almond milk, and protein powder</li>
            <li><strong>10:00 AM - Snack:</strong> A handful of mixed nuts and a boiled egg</li>
            <li><strong>1:00 PM - Lunch:</strong> Lentil curry with brown rice and a side of avocado</li>
            <li><strong>4:00 PM - Snack:</strong> Greek yogurt with honey and a handful of granola</li>
            <li><strong>7:00 PM - Dinner:</strong> Grilled tofu with sweet potatoes and steamed vegetables</li>
            <li><strong>9:00 PM - Snack (optional):</strong> A glass of warm skim milk with a tablespoon of peanut butter</li>
          </ul>
        `;
      } else {
        dietPlan = `
          <h2>Non-Vegetarian Muscle Gain Diet Plan</h2>
          <ul>
            <li><strong>7:00 AM - Breakfast:</strong> Scrambled eggs with whole-grain toast and a side of avocado</li>
            <li><strong>10:00 AM - Snack:</strong> A boiled egg or a handful of nuts</li>
            <li><strong>1:00 PM - Lunch:</strong> Grilled salmon with brown rice and a side of steamed vegetables</li>
            <li><strong>4:00 PM - Snack:</strong> Protein shake with banana and almond milk</li>
            <li><strong>7:00 PM - Dinner:</strong> Grilled chicken breast with sweet potatoes and roasted vegetables</li>
            <li><strong>9:00 PM - Snack (optional):</strong> A glass of warm skim milk with a tablespoon of peanut butter</li>
          </ul>
        `;
      }
      break;
    case 'maintain_weight':
      if (dietPreference === 'vegetarian') {
        dietPlan = `
          <h2>Vegetarian Maintain Weight Diet Plan</h2>
          <ul>
            <li><strong>7:00 AM - Breakfast:</strong> Smoothie with spinach, banana, and almond milk</li>
            <li><strong>10:00 AM - Snack:</strong> A handful of mixed nuts</li>
            <li><strong>1:00 PM - Lunch:</strong> Whole-grain pasta with pesto and a side of avocado</li>
            <li><strong>4:00 PM - Snack:</strong> Greek yogurt with honey</li>
            <li><strong>7:00 PM - Dinner:</strong> Grilled vegetables with quinoa and a side of hummus</li>
            <li><strong>9:00 PM - Snack (optional):</strong> A glass of warm skim milk</li>
          </ul>
        `;
      } else {
        dietPlan = `
          <h2>Non-Vegetarian Maintain Weight Diet Plan</h2>
          <ul>
            <li><strong>7:00 AM - Breakfast:</strong> Scrambled eggs with whole-grain toast and a side of avocado</li>
            <li><strong>10:00 AM - Snack:</strong> A boiled egg or a handful of nuts</li>
            <li><strong>1:00 PM - Lunch:</strong> Grilled chicken sandwich with avocado and a side of mixed greens</li>
            <li><strong>4:00 PM - Snack:</strong> A small apple or a handful of almonds</li>
            <li><strong>7:00 PM - Dinner:</strong> Grilled fish with a side of roasted vegetables</li>
            <li><strong>9:00 PM - Snack (optional):</strong> A glass of warm skim milk</li>
          </ul>
        `;
      }
      break;
    default:
      dietPlan = `<p>No specific plan selected.</p>`;
  }

  // Save diet plan to MongoDB
  try {
    const dietPlanData = { name, email, goal, height, weight, exerciseLevel, dietPreference, dietPlan };
    console.log('Saving diet plan to MongoDB:', dietPlanData);
    const result = await db.collection('dietPlans').insertOne(dietPlanData);
    console.log('Diet plan saved:', result.insertedId);
  } catch (error) {
    console.error('Error saving diet plan:', error);
    return res.status(500).json({ success: false, message: 'Failed to save diet plan' });
  }

  // Email content
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Personalized Diet Plan',
    html: `
      <h1>Hello ${name},</h1>
      <p>Here is your personalized diet plan based on your goal: <strong>${goal}</strong></p>
      <p>Height: ${height} cm</p>
      <p>Weight: ${weight} kg</p>
      <p>Exercise Level: ${exerciseLevel}</p>
      <p>Diet Preference: ${dietPreference}</p>
      ${dietPlan}
      <p>Best regards,<br>HealthConnect Team</p>
    `,
  };

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ success: false, message: 'Failed to send email' });
    }
    console.log('Email sent:', info.response);
    res.status(200).json({ success: true, message: 'Diet plan sent to your email!' });
  });
});

// Route to handle Appointments form submission
app.post('/book-appointment', async (req, res) => {
  console.log('Received request to /book-appointment');
  const { name, email, phone, date, time } = req.body;
  console.log('Request body:', req.body);

  // Save appointment to MongoDB
  try {
    const appointment = { name, email, phone, date, time };
    console.log('Saving appointment to MongoDB:', appointment);
    const result = await db.collection('appointments').insertOne(appointment);
    console.log('Appointment saved:', result.insertedId);
  } catch (error) {
    console.error('Error saving appointment:', error);
    return res.status(500).json({ success: false, message: 'Failed to save appointment' });
  }

  // Email content
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Appointment Confirmation',
    html: `
      <h1>Hello ${name},</h1>
      <p>Your appointment has been booked successfully!</p>
      <p>Date: ${date}</p>
      <p>Time: ${time}</p>
      <p>We will contact you at ${phone} for further details.</p>
      <p>Best regards,<br>HealthConnect Team</p>
    `,
  };

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      return res.status(500).json({ success: false, message: 'Failed to book appointment' });
    }
    console.log('Email sent:', info.response);
    res.status(200).json({ success: true, message: 'Appointment booked successfully!' });
  });
});

// Route to handle Get Started form submission
app.post('/get-started', async (req, res) => {
  console.log('Received request to /get-started');
  const { firstName, lastName, email, phone, password, goals } = req.body;
  console.log('Request body:', req.body);

  // Hash the password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Save user data to MongoDB
  try {
    const userData = { firstName, lastName, email, phone, password: hashedPassword, goals };
    console.log('Saving user to MongoDB:', userData);
    const result = await db.collection('users').insertOne(userData);
    console.log('User saved:', result.insertedId);

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to HealthConnect',
      html: `
        <h1>Hello ${firstName} ${lastName},</h1>
        <p>Thank you for signing up with HealthConnect!</p>
        <p>Your goals: <strong>${goals.join(', ')}</strong></p>
        <p>We will contact you shortly to help you get started.</p>
        <p>Best regards,<br>HealthConnect Team</p>
      `,
    };

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ success: false, message: 'Failed to send welcome email' });
      }
      console.log('Email sent:', info.response);
      res.status(200).json({ success: true, message: 'Thank you for signing up!'});
    });
  } catch (error) {
    console.error('Error saving user:', error);
    res.status(500).json({ success: false, message: 'Failed to sign up' });
  }
});

// Route to handle Sign In form submission
app.post('/signin', async (req, res) => {
  console.log('Received request to /signin');
  const { email, password } = req.body;
  console.log('Request body:', req.body);

  try {
    // Find the user by email
    const user = await db.collection('users').findOne({ email });

    if (user) {
      // Compare the provided password with the hashed password in the database
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (isPasswordValid) {
        console.log('Sign-in successful for user:', user.email);
        res.status(200).json({ success: true, message: 'Sign-in successful!', user });
      } else {
        console.log('Invalid password for user:', user.email);
        res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    } else {
      console.log('User not found:', email);
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    console.error('Error during sign-in:', error);
    res.status(500).json({ success: false, message: 'Failed to sign in' });
  }
});

// Handle all other routes (for React Router)
app.get('*', (req, res) => {
  console.log('Wildcard route accessed');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});