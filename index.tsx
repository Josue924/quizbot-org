import { GoogleGenAI, Type } from "@google/genai";

// --- CONFIGURATION ---
// Safely check if the API key is configured, preventing crashes if `process` is undefined.
const IS_API_CONFIGURED = typeof process !== 'undefined' && !!process.env?.API_KEY;
const API_KEY_ERROR_MESSAGE = "API_KEY environment variable is not set. Please add it in your Vercel project settings to use the quiz generator.";

// --- TYPE DEFINITIONS ---
interface QuizQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string; };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}
type Quiz = QuizQuestion[];
type UserAnswers = { [key: number]: 'A' | 'B' | 'C' | 'D' | null };

interface AppState {
    topic: string;
    numQuestions: number;
    quiz: Quiz | null;
    loading: boolean;
    error: string | null;
    userAnswers: UserAnswers;
    submitted: boolean;
    score: number;
}

// --- STATE MANAGEMENT ---
const state: AppState = {
  topic: 'World Capitals',
  numQuestions: 5,
  quiz: null,
  loading: false,
  error: IS_API_CONFIGURED ? null : API_KEY_ERROR_MESSAGE,
  userAnswers: {},
  submitted: false,
  score: 0,
};

// --- DOM ROOT ---
const root = document.getElementById('root');
if (!root) {
    throw new Error("Could not find root element");
}

// --- ICONS ---
const RobotIcon = (props: { className: string }) => `
  <svg xmlns="http://www.w3.org/2000/svg" class="${props.className}" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M7 7h10a2 2 0 0 1 2 2v1l1 1v3l-1 1v3a2 2 0 0 1 -2 -2h-10a2 2 0 0 1 -2 -2v-3l-1 -1v-3l1 -1v-1a2 2 0 0 1 2 -2z" />
    <path d="M10 16h4" />
    <circle cx="8.5" cy="11.5" r=".5" fill="currentColor" />
    <circle cx="15.5" cy="11.5" r=".5" fill="currentColor" />
    <path d="M9 7l-1 -4" />
    <path d="M15 7l1 -4" />
  </svg>`;

const SparklesIcon = (props: { className: string }) => `
  <svg xmlns="http://www.w3.org/2000/svg" class="${props.className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM18 13.5l.375 1.5.375-1.5a2.625 2.625 0 00-1.99-1.99l-1.5-.375 1.5-.375a2.625 2.625 0 001.99-1.99l.375-1.5-.375 1.5a2.625 2.625 0 001.99 1.99l1.5.375-1.5.375a2.625 2.625 0 00-1.99 1.99z" />
  </svg>`;

const CheckIcon = (props: { className: string }) => `
    <svg xmlns="http://www.w3.org/2000/svg" class="${props.className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>`;

const XIcon = (props: { className: string }) => `
    <svg xmlns="http://www.w3.org/2000/svg" class="${props.className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>`;

// --- GEMINI SERVICE ---
let ai: GoogleGenAI | null = null;
const getAiClient = () => {
    if (ai) return ai;
    if (IS_API_CONFIGURED) {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        return ai;
    }
    return null;
}

const systemInstruction = `You are QuizBot, an intelligent, user-friendly quiz generation assistant designed to help people learn, test, and expand their knowledge. Your primary function is to create high-quality, factually accurate quizzes on general knowledge topics or any specific subject the user requests. The audience includes students, educators, and lifelong learners. Your tone must be friendly, engaging, and encouraging, while still maintaining professional accuracy. Always use clear, easy-to-understand language and explain any technical or uncommon terms. You must provide educational value in every response, ensuring that each quiz is both informative and enjoyable.

When generating a quiz, follow the JSON schema provided exactly. Always include four multiple-choice options. Make sure at least one wrong answer is plausible, but the correct answer is clear and supported by the explanation. If you are not certain about an answer, clearly state your uncertainty and provide the most reliable information available.
Your responses must be optimized for direct display on a user interface. Be consistent in style, ensure your content is visually organized, and aim to create an engaging learning experience.`;


const generateQuiz = async (topic: string, numQuestions: number): Promise<Quiz> => {
    const aiClient = getAiClient();
    if (!aiClient) {
        // This should not happen if IS_API_CONFIGURED is checked before calling.
        throw new Error("API Client is not initialized.");
    }

    try {
        const response = await aiClient.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Please generate a quiz with ${numQuestions} questions about: "${topic}".`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING, description: 'The quiz question.' },
                            options: {
                                type: Type.OBJECT,
                                properties: {
                                    A: { type: Type.STRING }, B: { type: Type.STRING },
                                    C: { type: Type.STRING }, D: { type: Type.STRING },
                                },
                                required: ['A', 'B', 'C', 'D']
                            },
                            correctAnswer: { type: Type.STRING, enum: ['A', 'B', 'C', 'D'] },
                            explanation: { type: Type.STRING, description: 'A brief, 1-2 sentence factual explanation.' }
                        },
                        required: ['question', 'options', 'correctAnswer', 'explanation']
                    }
                },
                temperature: 0.7,
                topP: 1,
                topK: 32,
            },
        });
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error("Error generating quiz:", error);
        throw new Error(`Failed to generate quiz. Please check your topic or try again later.`);
    }
};

// --- EVENT HANDLERS ---
const handleGenerateQuiz = async () => {
    if (!IS_API_CONFIGURED || !state.topic.trim() || state.loading) {
        return; // Button should be disabled, but this is a safeguard.
    }
    
    state.loading = true;
    state.error = null;
    state.quiz = null;
    state.submitted = false;
    render();

    try {
      const quizData = await generateQuiz(state.topic, state.numQuestions);
      if (quizData && quizData.length > 0) {
        state.quiz = quizData;
        state.userAnswers = {};
        quizData.forEach((_, index) => {
            state.userAnswers[index] = null;
        });
      } else {
        state.error = "The generated quiz was empty. Please try a different topic.";
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : 'An unknown error occurred.';
    } finally {
      state.loading = false;
      render();
    }
};

const handleAnswerSelect = (questionIndex: number, answer: 'A' | 'B' | 'C' | 'D') => {
    if (state.submitted) return;
    state.userAnswers[questionIndex] = answer;
    render();
};

const handleSubmitQuiz = () => {
    if (!state.quiz) return;
    let currentScore = 0;
    state.quiz.forEach((q, index) => {
      if (state.userAnswers[index] === q.correctAnswer) {
        currentScore++;
      }
    });
    state.score = currentScore;
    state.submitted = true;
    window.scrollTo(0, 0);
    render();
};

const handleReset = () => {
    state.quiz = null;
    state.submitted = false;
    state.userAnswers = {};
    state.score = 0;
    state.error = IS_API_CONFIGURED ? null : API_KEY_ERROR_MESSAGE;
    state.topic = 'World Capitals';
    state.numQuestions = 5;
    render();
};

// --- RENDER FUNCTIONS (HTML Templates) ---

const renderHeader = () => `
  <header>
    <div class="header-title-container">
      ${RobotIcon({ className: 'w-12 h-12 text-sky-400' })}
      <h1>Quiz<span class="text-sky-400">Bot</span></h1>
    </div>
    <p class="subtitle">Your friendly AI assistant for creating fun and educational quizzes.</p>
  </header>`;

const renderFooter = () => `
  <footer>
    <p>Powered by Google Gemini API. Created with Vanilla JS & CSS.</p>
  </footer>`;

const renderQuizForm = () => `
  <div class="form-container">
    <form id="quiz-form">
      <div class="form-group">
        <label for="topic">What topic do you want a quiz on?</label>
        <input type="text" id="topic" value="${state.topic}" placeholder="e.g., 'Ancient Rome'" required>
      </div>
      <div class="form-group">
        <label for="numQuestions">How many questions?</label>
        <input type="number" id="numQuestions" value="${state.numQuestions}" min="1" max="10" required>
      </div>
      <button type="submit" id="generate-quiz-btn" class="btn btn-primary" ${state.loading || !state.topic.trim() || !IS_API_CONFIGURED ? 'disabled' : ''}>
        ${state.loading ? 'Generating...' : `${SparklesIcon({className: 'w-5 h-5'})} Generate Quiz`}
      </button>
    </form>
  </div>`;

const renderLoadingSpinner = () => `
  <div class="loading-spinner-container">
    <div class="loading-spinner"></div>
    <p>QuizBot is thinking...</p>
  </div>`;

const renderError = (message: string) => `
  <div class="error-box">
    <h3>Oops! Something went wrong.</h3>
    <p>${message}</p>
  </div>`;

const renderQuizDisplay = () => {
  if (!state.quiz) return '';
  return `
    <div class="quiz-display">
      ${state.quiz.map((q, i) => renderQuestionCard(q, i)).join('')}
      ${!state.submitted && state.quiz.length > 0 ? `
        <div class="quiz-submit-container">
          <button id="submit-quiz-btn" class="btn btn-submit">Submit Quiz</button>
        </div>
      ` : ''}
    </div>
  `;
};

const renderQuestionCard = (questionData: QuizQuestion, index: number) => {
  const userAnswer = state.userAnswers[index];
  const { question, options, correctAnswer, explanation } = questionData;

  const getOptionClass = (optionKey: 'A' | 'B' | 'C' | 'D') => {
    if (!state.submitted) {
      return userAnswer === optionKey ? 'selected' : '';
    }
    const isCorrect = optionKey === correctAnswer;
    const isSelected = optionKey === userAnswer;

    if (isCorrect) return 'correct';
    if (isSelected && !isCorrect) return 'incorrect';
    return '';
  };
  
  return `
    <div class="question-card">
      <h3>Question ${index + 1}</h3>
      <p class="question-text">${question}</p>
      <div class="options-grid">
        ${Object.entries(options).map(([key, value]) => `
          <button 
            class="option-btn ${getOptionClass(key as 'A' | 'B' | 'C' | 'D')}" 
            data-question-index="${index}" 
            data-answer="${key}"
            ${state.submitted ? 'disabled' : ''}
            aria-label="Option ${key}: ${value}"
          >
            <span>${key}) ${value}</span>
            ${state.submitted ? `
              ${key === correctAnswer ? CheckIcon({className: 'w-6 h-6 text-green-400'}) : ''}
              ${userAnswer === key && key !== correctAnswer ? XIcon({className: 'w-6 h-6 text-red-400'}) : ''}
            ` : ''}
          </button>
        `).join('')}
      </div>
      ${state.submitted ? `
        <div class="explanation">
          <p>
            <span class="status ${userAnswer === correctAnswer ? 'correct' : 'incorrect'}">
              ${userAnswer === correctAnswer ? 'Correct!' : 'Incorrect.'}
            </span>
            The correct answer is ${correctAnswer}.
          </p>
          <p class="mt-2">${explanation}</p>
        </div>
      ` : ''}
    </div>`;
};

const renderScoreSummary = () => {
    if (!state.quiz) return '';
    const score = state.score;
    const totalQuestions = state.quiz.length;
    const percentage = Math.round((score / totalQuestions) * 100);
  
    let message = "";
    if (percentage === 100) message = "Perfect Score! You're a genius!";
    else if (percentage >= 80) message = "Great job! You really know your stuff.";
    else if (percentage >= 50) message = "Good effort! Keep learning and try again.";
    else message = "Keep practicing! Knowledge is a journey.";

    return `
        <div class="score-summary">
            <h2>Quiz Complete!</h2>
            <p class="score-text">You scored:</p>
            <p class="score-value">${score} / ${totalQuestions}</p>
            <div class="progress-bar" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar-inner" style="width: 0%;" data-final-width="${percentage}%"></div>
            </div>
            <p class="message">${message}</p>
            <button id="reset-quiz-btn" class="btn btn-primary">Create Another Quiz</button>
        </div>
    `;
};


// --- MAIN RENDER FUNCTION ---
const render = () => {
    let mainContent = '';

    if (state.loading) {
        mainContent = renderLoadingSpinner();
    } else if (state.quiz) {
        if (state.submitted) {
            mainContent += renderScoreSummary();
        }
        mainContent += renderQuizDisplay();
    } else {
        mainContent = `<div style="max-width: 28rem; margin: 0 auto;">${renderQuizForm()}`;
        if (state.error) {
           mainContent += renderError(state.error);
        }
        mainContent += `</div>`;
    }

    root.innerHTML = `
        <main>
            ${renderHeader()}
            <div role="status" aria-live="polite">${state.loading ? 'Generating quiz...' : ''}</div>
            ${mainContent}
        </main>
        ${renderFooter()}
    `;
    
    // Animate progress bar after it's in the DOM
    const progressBar = root.querySelector<HTMLElement>('.progress-bar-inner');
    if(progressBar) {
        setTimeout(() => {
            if (progressBar.dataset.finalWidth) {
                progressBar.style.width = progressBar.dataset.finalWidth;
            }
        }, 100);
    }
};

// --- EVENT LISTENERS (Delegated) ---
root.addEventListener('submit', e => {
    if ((e.target as Element)?.id === 'quiz-form') {
        e.preventDefault();
        handleGenerateQuiz();
    }
});

root.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const optionButton = target.closest<HTMLButtonElement>('.option-btn');
    if (optionButton) {
        const { questionIndex, answer } = optionButton.dataset;
        if (questionIndex && answer) {
            handleAnswerSelect(parseInt(questionIndex, 10), answer as 'A' | 'B' | 'C' | 'D');
        }
        return;
    }
    if (target.closest('#submit-quiz-btn')) {
        handleSubmitQuiz();
        return;
    }
    if (target.closest('#reset-quiz-btn')) {
        handleReset();
        return;
    }
});

root.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'topic') {
        state.topic = target.value;
        const generateBtn = root.querySelector<HTMLButtonElement>('#generate-quiz-btn');
        if (generateBtn) {
            generateBtn.disabled = state.loading || !state.topic.trim() || !IS_API_CONFIGURED;
        }
    }
    if (target.id === 'numQuestions') {
        state.numQuestions = Math.max(1, Math.min(10, parseInt(target.value, 10) || 1));
        if (target.value !== String(state.numQuestions)) {
            target.value = String(state.numQuestions);
        }
    }
});


// --- INITIAL APP RENDER ---
render();