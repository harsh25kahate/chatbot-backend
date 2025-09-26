# Divyang Portal API Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Project Structure](#project-structure)
3. [Installation & Setup](#installation--setup)
4. [Configuration & Environment Variables](#configuration--environment-variables)
5. [Architecture & Code Flow](#architecture--code-flow)
6. [API Documentation](#api-documentation)
7. [Core Functions Documentation](#core-functions-documentation)
8. [Data Models & Schema](#data-models--schema)
9. [Error Handling](#error-handling)
10. [Testing Guide](#testing-guide)
11. [Deployment Guide](#deployment-guide)
12. [Contributing Guide](#contributing-guide)
13. [Examples & Tutorials](#examples--tutorials)

---

## Project Overview

### Purpose
The Divyang Portal API is a Node.js-based chatbot service designed to help disabled persons (दिव्यांग) in India access information about government schemes and services. The API provides conversational support in Marathi language and helps users with:

- **Government Scheme Discovery**: Finding relevant yojanas (schemes) based on user criteria
- **Portal Navigation**: Assistance with login and registration processes
- **Conversational Support**: Natural language interaction in Marathi

### Main Features
- 🤖 **AI-Powered Chatbot**: Uses Google's Gemini AI for natural language processing
- 🗣️ **Marathi Language Support**: All responses in Marathi for local accessibility
- 🔍 **Smart Scheme Filtering**: Filters government schemes based on age, disability type, and other criteria
- 💬 **Conversation Memory**: Maintains user session history for contextual responses
- 🌐 **CORS Enabled**: Cross-origin support for web applications
- 📱 **RESTful API**: Simple JSON-based API endpoints

### Technology Stack
- **Runtime**: Node.js with ES6 modules
- **Framework**: Express.js
- **AI Service**: Google Gemini AI (gemini-1.5-flash)
- **Validation**: Zod schema validation
- **HTTP Client**: node-fetch
- **Environment**: dotenv for configuration

---

## Project Structure

Since this is a single-file application, here's the logical structure:

```
divyang-portal-api/
├── index.js                 # Main application file (all code)
├── package.json            # Dependencies and scripts
├── .env                    # Environment variables (not in repo)
├── .gitignore             # Git ignore file
└── README.md              # Basic project info
```

### Recommended Structure for Scaling
If you want to expand this project, consider this structure:

```
divyang-portal-api/
├── src/
│   ├── controllers/        # Request handlers
│   │   └── chatController.js
│   ├── services/          # Business logic
│   │   ├── aiService.js
│   │   └── yojanaService.js
│   ├── middleware/        # Custom middleware
│   │   └── validation.js
│   ├── routes/           # API routes
│   │   └── chatRoutes.js
│   ├── utils/            # Utility functions
│   │   └── sessionManager.js
│   └── config/           # Configuration files
│       └── database.js
├── tests/                # Test files
├── docs/                 # Documentation
├── package.json
├── .env
└── README.md
```

---

## Installation & Setup

### Prerequisites
- **Node.js**: Version 16.0 or higher
- **npm**: Version 8.0 or higher
- **Google Gemini API Key**: Required for AI functionality

### Step-by-Step Setup

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd divyang-portal-api
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Create Environment File**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Set Environment Variables**
   ```bash
   # Required
   GEMINI_API_KEY=your_google_gemini_api_key_here
   
   # Optional
   PORT=5000
   ```

5. **Run the Application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Verify Installation**
   Open http://localhost:5000/api/health in your browser
   You should see: `{"ok":true}`

### Package.json Scripts
```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "jest"
  }
}
```

---

## Configuration & Environment Variables

### Environment Variables (.env file)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | ✅ Yes | None | Google Gemini AI API key for chatbot functionality |
| `PORT` | ❌ No | 5000 | Port number for the server |

### Getting Google Gemini API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key and add it to your `.env` file

### CORS Configuration
The API allows requests from:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (React dev server)
- `http://localhost:44308` (Custom port)
- `http://192.168.1.41:44308` (Local network)
- `*.railway.app` (Railway deployment)

---

## Architecture & Code Flow

### High-Level Architecture
```
Client Request → Express Server → Validation → Session Management → AI Processing → Response
```

### Detailed Request Flow

1. **Request Reception**
   ```
   POST /api/chat → Express Router → CORS Check → JSON Parser
   ```

2. **Validation Layer**
   ```
   Request Body → Zod Schema Validation → Error Handling
   ```

3. **Session Management**
   ```
   User ID → Session Lookup → Initialize/Retrieve Session → Update History
   ```

4. **Data Fetching**
   ```
   External API Call → Fetch Yojanas → Error Handling → Data Processing
   ```

5. **AI Processing**
   ```
   User Message + Context + Yojanas → Gemini AI → Response Generation
   ```

6. **Response Formatting**
   ```
   AI Response → JSON Parsing → Response Structure → Client Response
   ```

### Key Components

#### 1. Express Application Setup
- Configures middleware (CORS, JSON parsing)
- Sets up routing and error handling
- Initializes AI service connection

#### 2. Session Management
- In-memory storage for user conversations
- Maintains conversation history for context
- Language preference tracking

#### 3. AI Integration
- Google Gemini AI for natural language processing
- Prompt engineering for Marathi responses
- Context-aware conversation handling

#### 4. External Data Integration
- Fetches government schemes from external API
- Handles API failures gracefully
- Caches data for performance

---

## API Documentation

### Base URL
- **Development**: `http://localhost:5000`
- **Production**: Your deployed server URL

### Authentication
- No authentication required
- CORS-enabled for specified origins

---

### Endpoints

#### 1. Health Check

**GET** `/api/health`

**Purpose**: Check if the server is running

**Request**:
```bash
GET /api/health
```

**Response**:
```json
{
  "ok": true
}
```

---

#### 2. Chat Endpoint

**POST** `/api/chat`

**Purpose**: Send a message to the chatbot and receive AI-powered response with relevant information

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "message": "मला नोकरीसाठी योजना हवी",
  "context": {
    "userId": "user123",
    "locale": "mr",
    "app": "divyang-portal"
  }
}
```

**Request Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | ✅ Yes | User's message/query (any language, but Marathi preferred) |
| `context` | object | ❌ No | Additional context information |
| `context.userId` | string | ❌ No | Unique user identifier for session management |
| `context.locale` | string | ❌ No | User's preferred language (currently forced to 'mr') |
| `context.app` | string | ❌ No | Application identifier |

**Success Response (200)**:
```json
{
  "message": "प्रिय दिव्यांग, तुमच्यासाठी खालील योजना उपलब्ध आहेत:",
  "links": [
    {
      "label": "दिव्यांग पोर्टलवर लॉगिन करा",
      "url": "https://divyangahilyanagar.altwise.in/home/login"
    }
  ],
  "yojanas": [
    {
      "YojanaId": "123",
      "YojanaName": "स्वरोजगार योजना",
      "YojanaDescription": "दिव्यांगांसाठी स्वरोजगार संधी",
      "Start_Age": 18,
      "UpTo_Age": 60,
      "YojanaApplayLastDate": "2024-12-31",
      "PublishedBy": "महाराष्ट्र सरकार"
    }
  ]
}
```

**Error Response (400 - Validation Error)**:
```json
{
  "message": "प्रिय दिव्यांग, अयशस्वी विनंती. कृपया पुन्हा प्रयत्न करा.",
  "errors": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["message"]
    }
  ],
  "links": [],
  "yojanas": []
}
```

**Error Response (500 - Server Error)**:
```json
{
  "message": "प्रिय दिव्यांग, माफ करा, सर्व्हरमध्ये त्रुटी आली आहे.",
  "links": [],
  "yojanas": []
}
```

---

### Example API Calls

#### 1. Simple Greeting
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "नमस्कार"
  }'
```

#### 2. Login Help
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "मला लॉगिन करायचं आहे",
    "context": {
      "userId": "user123"
    }
  }'
```

#### 3. Scheme Query
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "मला 25 वर्षाच्या दृष्टिदोष असलेल्यासाठी योजना हवी",
    "context": {
      "userId": "user123",
      "locale": "mr"
    }
  }'
```

---

## Core Functions Documentation

### 1. `initializeSession(userId)`

**Purpose**: Creates or retrieves user session for conversation management

**Parameters**:
- `userId` (string): Unique identifier for the user

**Returns**:
- `Object`: User session containing conversation history and preferences

**Logic**:
```javascript
function initializeSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      conversationHistory: [],
      lastLanguage: 'mr' // Force Marathi
    });
  }
  return userSessions.get(userId);
}
```

**Example**:
```javascript
const session = initializeSession('user123');
// Returns: { conversationHistory: [], lastLanguage: 'mr' }
```

---

### 2. `fetchYojanas()`

**Purpose**: Retrieves government schemes data from external API with error handling

**Parameters**: None

**Returns**:
- `Array`: List of yojana objects, or empty array on error

**Logic**:
- Makes HTTPS request to external API
- Handles SSL certificate issues
- Returns empty array if API fails
- Ensures returned data is always an array

**Error Handling**:
- Network failures
- Invalid JSON responses
- API downtime

**Example**:
```javascript
const yojanas = await fetchYojanas();
// Returns: [{ YojanaId: "123", YojanaName: "...", ... }, ...]
```

---

### 3. Chat Request Handler

**Purpose**: Main endpoint handler for chat functionality

**Parameters**:
- `req` (Express Request): Contains user message and context
- `res` (Express Response): Response object

**Process Flow**:
1. **Validation**: Validates request using Zod schema
2. **Session Management**: Initializes/retrieves user session
3. **Data Fetching**: Gets latest yojanas from external API
4. **AI Processing**: Sends prompt to Gemini AI with context
5. **Response Parsing**: Parses and validates AI response
6. **Session Update**: Updates conversation history
7. **Response**: Sends formatted response to client

**Error Scenarios**:
- Invalid request format
- AI service unavailable
- External API failure
- JSON parsing errors

---

## Data Models & Schema

### Request Schema (Zod Validation)

```javascript
const chatRequestSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    userId: z.string().optional(),
    locale: z.string().optional(),
    app: z.string().optional()
  }).optional()
});
```

### User Session Model

```javascript
{
  conversationHistory: [
    {
      type: 'user' | 'bot',
      message: string,
      timestamp: Date
    }
  ],
  lastLanguage: string // Always 'mr' for Marathi
}
```

### Yojana (Scheme) Model

```javascript
{
  YojanaId: string,           // Unique scheme identifier
  YojanaName: string,         // Scheme name in Marathi
  YojanaDescription: string,  // Detailed description
  Start_Age: number,          // Minimum age requirement
  UpTo_Age: number,          // Maximum age requirement
  YojanaApplayLastDate: string, // Application deadline
  YojanaPublishDate: string,  // Publication date
  PublishedBy: string,        // Publishing authority
  tblYojanaDivyangTypePercentages: array, // Disability percentage requirements
  tblDivyangTypes: array      // Applicable disability types
}
```

### API Response Model

```javascript
{
  message: string,      // AI response in Marathi
  links: [              // Action links (login/register)
    {
      label: string,    // Link text in Marathi
      url: string       // Target URL
    }
  ],
  yojanas: [            // Matching schemes
    // Yojana objects as defined above
  ]
}
```

---

## Error Handling

### Error Types and Responses

#### 1. Validation Errors (400)
**Cause**: Invalid request format or missing required fields

**Response Format**:
```json
{
  "message": "प्रिय दिव्यांग, अयशस्वी विनंती. कृपया पुन्हा प्रयत्न करा.",
  "errors": [/* Zod validation errors */],
  "links": [],
  "yojanas": []
}
```

#### 2. Server Errors (500)
**Cause**: Internal server errors, AI service failures, or external API issues

**Response Format**:
```json
{
  "message": "प्रिय दिव्यांग, माफ करा, सर्व्हरमध्ये त्रुटी आली आहे.",
  "links": [],
  "yojanas": []
}
```

#### 3. AI Response Parsing Errors
**Cause**: Invalid JSON from Gemini AI

**Fallback Response**:
```json
{
  "message": "प्रिय दिव्यांग, माफ करा, काहीतरी चुकलं. कृपया पुन्हा प्रयत्न करा.",
  "links": [],
  "yojanas": []
}
```

### Error Handling Strategies

1. **Graceful Degradation**: External API failures don't break the chat
2. **User-Friendly Messages**: All errors shown in Marathi
3. **Logging**: Server-side error logging for debugging
4. **Fallback Responses**: Default responses when AI fails
5. **Input Validation**: Strict validation prevents malformed requests

---

## Testing Guide

### Current Testing Status
⚠️ **No tests are currently implemented**

### Recommended Testing Structure

#### 1. Unit Tests
```bash
npm install --save-dev jest supertest
```

**Test Files Structure**:
```
tests/
├── unit/
│   ├── sessionManager.test.js
│   ├── yojanaService.test.js
│   └── validators.test.js
├── integration/
│   ├── chat.test.js
│   └── health.test.js
└── fixtures/
    ├── mockYojanas.json
    └── mockResponses.json
```

#### 2. Example Test Cases

**Health Endpoint Test**:
```javascript
const request = require('supertest');
const app = require('../index');

describe('Health Endpoint', () => {
  it('should return ok status', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(res.body).toEqual({ ok: true });
  });
});
```

**Chat Endpoint Test**:
```javascript
describe('Chat Endpoint', () => {
  it('should handle valid message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        message: 'नमस्कार',
        context: { userId: 'test123' }
      })
      .expect(200);
    
    expect(res.body.message).toContain('प्रिय दिव्यांग');
  });

  it('should reject empty message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: '' })
      .expect(400);
    
    expect(res.body.errors).toBeDefined();
  });
});
```

#### 3. Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test tests/integration/chat.test.js

# Watch mode for development
npm run test:watch
```

---

## Deployment Guide

### Prerequisites for Deployment
- Node.js 16+ environment
- Google Gemini API key
- Domain/hosting service

### Deployment Options

#### 1. Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway deploy
```

**Railway Configuration**:
- Set `GEMINI_API_KEY` in environment variables
- Port is automatically assigned by Railway

#### 2. Heroku
```bash
# Install Heroku CLI and login
heroku create your-app-name
heroku config:set GEMINI_API_KEY=your_api_key
git push heroku main
```

**Procfile**:
```
web: node index.js
```

#### 3. Docker Deployment
**Dockerfile**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "index.js"]
```

**Docker Commands**:
```bash
docker build -t divyang-portal-api .
docker run -p 5000:5000 -e GEMINI_API_KEY=your_key divyang-portal-api
```

#### 4. PM2 (Production Server)
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start index.js --name "divyang-portal-api"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Environment Configuration for Production

**Production .env**:
```bash
NODE_ENV=production
PORT=5000
GEMINI_API_KEY=your_production_api_key
```

### Health Monitoring
- Set up health checks at `/api/health`
- Monitor logs for errors
- Set up alerts for API failures

---

## Contributing Guide

### Development Setup
1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Create feature branch: `git checkout -b feature/your-feature`
4. Install dependencies: `npm install`
5. Create `.env` file with your API keys

### Coding Standards
- **ES6 Modules**: Use import/export syntax
- **Async/Await**: Prefer async/await over promises
- **Error Handling**: Always handle errors gracefully
- **Marathi Responses**: All user-facing messages in Marathi
- **Comments**: Document complex logic in English

### Code Style Guidelines
```javascript
// Good: Descriptive function names
async function fetchYojanas() { }

// Good: Proper error handling
try {
  const result = await apiCall();
  return result;
} catch (error) {
  console.error('API call failed:', error);
  return [];
}

// Good: Consistent response format
return res.json({
  message: 'प्रिय दिव्यांग, ...',
  links: [],
  yojanas: []
});
```

### Pull Request Process
1. **Create Feature Branch**: `feature/add-new-endpoint`
2. **Write Tests**: Add unit/integration tests for new features
3. **Update Documentation**: Update this README for any changes
4. **Test Locally**: Ensure all tests pass
5. **Submit PR**: With detailed description of changes

### Issues and Bugs
- Use GitHub issues for bug reports
- Provide steps to reproduce
- Include error messages and logs
- Label issues appropriately

---

## Examples & Tutorials

### Tutorial 1: Basic Chat Interaction

**Scenario**: User greets the bot and asks for help

```bash
# Step 1: Greeting
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "नमस्कार",
    "context": {"userId": "tutorial_user"}
  }'
```

**Expected Response**:
```json
{
  "message": "प्रिय दिव्यांग, नमस्कार! तुम्हाला कशी मदत करू?",
  "links": [],
  "yojanas": []
}
```

### Tutorial 2: Login Assistance

**Scenario**: User needs help with login

```bash
# Step 1: Ask for login help
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "मला पोर्टलवर लॉगिन करायचं आहे",
    "context": {"userId": "tutorial_user"}
  }'
```

**Expected Response**:
```json
{
  "message": "प्रिय दिव्यांग, लॉगिनसाठी खालील दुवा वापरा:",
  "links": [
    {
      "label": "दिव्यांग पोर्टलवर लॉगिन करा",
      "url": "https://divyangahilyanagar.altwise.in/home/login"
    }
  ],
  "yojanas": []
}
```

### Tutorial 3: Scheme Discovery

**Scenario**: User looking for specific schemes

```bash
# Step 1: Ask for schemes
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "मला 30 वर्षीय दृष्टिदोषासाठी शिक्षण योजना हवी",
    "context": {"userId": "tutorial_user"}
  }'
```

**Expected Response**:
```json
{
  "message": "प्रिय दिव्यांग, तुमच्या वयोगट आणि अपंगत्वासाठी खालील योजना आहेत:",
  "links": [],
  "yojanas": [
    {
      "YojanaId": "EDU001",
      "YojanaName": "दृष्टिदोष शिक्षण सहाय्य योजना",
      "YojanaDescription": "दृष्टिदोष व्यक्तींना उच्च शिक्षणासाठी आर्थिक सहाय्य",
      "Start_Age": 18,
      "UpTo_Age": 45,
      "PublishedBy": "शिक्षण मंत्रालय"
    }
  ]
}
```

### Tutorial 4: Session Management

**Scenario**: Understanding conversation context

```javascript
// First interaction
const session1 = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'मला शिक्षण योजना हवी',
    context: { userId: 'user123' }
  })
});

// Follow-up question (bot remembers context)
const session2 = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'त्यासाठी काय कागदपत्रं लागतात?',
    context: { userId: 'user123' } // Same user ID
  })
});
```

### Tutorial 5: Error Handling Examples

**Invalid Request Example**:
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "",
    "context": {"userId": "error_user"}
  }'
```

**Response**:
```json
{
  "message": "प्रिय दिव्यांग, अयशस्वी विनंती. कृपया पुन्हा प्रयत्न करा.",
  "errors": [
    {
      "code": "too_small",
      "message": "String must contain at least 1 character(s)"
    }
  ],
  "links": [],
  "yojanas": []
}
```

---

### Workflow Example: Complete User Journey

```javascript
// 1. User starts conversation
POST /api/chat
{
  "message": "नमस्कार",
  "context": {"userId": "journey_user"}
}
// Response: Greeting with offer to help

// 2. User asks about schemes
POST /api/chat
{
  "message": "मला कामासाठी योजना हवी",
  "context": {"userId": "journey_user"}
}
// Response: List of employment schemes

// 3. User asks about application process
POST /api/chat
{
  "message": "यासाठी अर्ज कसा करावा?",
  "context": {"userId": "journey_user"}
}
// Response: Application guidance with portal link

// 4. User needs login help
POST /api/chat
{
  "message": "मला लॉगिन करायचं आहे",
  "context": {"userId": "journey_user"}
}
// Response: Login link provided
```

---

## Troubleshooting

### Common Issues

#### 1. GEMINI_API_KEY Error
**Error**: `GEMINI_API_KEY is required`
**Solution**: 
- Ensure `.env` file exists
- Check API key is valid and not expired
- Verify no extra spaces in the key

#### 2. CORS Errors
**Error**: Cross-origin request blocked
**Solution**: 
- Add your domain to the CORS origins array
- Ensure credentials: true if sending cookies

#### 3. External API Timeout
**Error**: Yojana data not loading
**Solution**: 
- Check network connectivity
- The API has built-in error handling and will return empty array

#### 4. AI Response Parsing Error
**Error**: JSON parsing failed
**Solution**: 
- AI service returns fallback response
- Check Gemini API status
- Verify API quota not exceeded

### Performance Optimization
- Implement caching for yojana data
- Add request rate limiting
- Use clustering for multiple CPU cores
- Implement response compression

---

## Additional Resources

- [Google Gemini AI Documentation](https://ai.google.dev/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Zod Validation](https://zod.dev/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

*This documentation is maintained by the development team. For questions or updates, please create an issue or submit a pull request.*