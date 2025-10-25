// Appwrite Configuration
const DATABASE_ID = '678c3e6f002d66845fa3'; // Your actual database ID
const COLLECTION_ID = 'chat_sessions';
const PROJECT_ID = '68c3345200239a1d1d37'; // Your project ID

// Appwrite instances
let client, account, databases, Query;

// Initialize Appwrite and Databases with your API key
function initAppwrite() {
    try {
        // Import Appwrite dynamically with proper error handling
        import('https://cdn.jsdelivr.net/npm/appwrite@13.0.1/+esm')
            .then(({ Client, Account, Databases, Query: AppwriteQuery }) => {
                client = new Client()
                    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
                    .setProject(PROJECT_ID);

                account = new Account(client);
                databases = new Databases(client);
                Query = AppwriteQuery; // Store Query for use in functions

                console.log('Appwrite initialized successfully');

                // Check auth status after initialization
                checkAuthStatus();
            })
            .catch(error => {
                console.log('Appwrite initialization failed:', error);
            });
    } catch (error) {
        console.log('Appwrite import failed:', error);
    }
}

// Save editor content to database
async function saveEditorSession() {
    if (!databases || !state.currentUser || !state.monacoEditor) {
        console.log('Cannot save: missing dependencies', {
            databases: !!databases,
            currentUser: !!state.currentUser,
            monacoEditor: !!state.monacoEditor
        });
        return;
    }

    try {
        const editorContent = state.monacoEditor.getValue().trim();

        // Only save if there's content in the editor
        if (!editorContent || editorContent === '// Your code will appear here\n// Send a message to get started') {
            console.log('No content to save');
            return;
        }

        const sessionData = {
            user_id: state.currentUser.$id,
            session_id: state.currentSessionId,
            editor_content: editorContent,
            session_title: getSessionTitleFromContent(editorContent),
            updated_at: new Date().toISOString()
        };

        console.log('Attempting to save session:', state.currentSessionId);

        // Try to update existing session first
        try {
            await databases.updateDocument(
                DATABASE_ID,
                COLLECTION_ID,
                state.currentSessionId,
                sessionData
            );
            console.log('Session updated successfully:', state.currentSessionId);
        } catch (error) {
            console.log('Update failed, attempting to create new document:', error.message);
            // If document doesn't exist, create it
            if (error.code === 404 || error.message.includes('Document not found')) {
                await databases.createDocument(
                    DATABASE_ID,
                    COLLECTION_ID,
                    state.currentSessionId,
                    {
                        ...sessionData,
                        created_at: new Date().toISOString()
                    }
                );
                console.log('New session created successfully:', state.currentSessionId);
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error saving editor session:', error);
        // Don't show error to user for auto-save failures
    }
}

// Load chat history for user (now loads editor history)
async function loadChatHistory() {
    if (!databases || !state.currentUser || !Query) {
        console.log('Cannot load history: missing dependencies', {
            databases: !!databases,
            currentUser: !!state.currentUser,
            Query: !!Query
        });
        return;
    }

    try {
        console.log('Loading chat history for user:', state.currentUser.$id);

        const response = await databases.listDocuments(
            DATABASE_ID,
            COLLECTION_ID,
            [
                Query.equal('user_id', state.currentUser.$id),
                Query.orderDesc('updated_at'),
                Query.limit(20) // Load last 20 sessions
            ]
        );

        console.log('Loaded sessions:', response.documents.length);
        displayEditorHistory(response.documents);
    } catch (error) {
        console.error('Error loading editor history:', error);
        // Show empty history on error
        displayEditorHistory([]);
    }
}

// Update UI based on authentication status
function updateAuthUI(user = null) {
    if (user && elements.loginBtn && elements.userProfile) {
        // User is authenticated
        state.userRegistered = true;
        state.currentUser = user;

        // Hide login button and show user profile
        elements.loginBtn.classList.add('hidden');
        elements.userProfile.classList.add('active');

        // Update user info
        if (elements.userName) {
            elements.userName.textContent = user.name || user.email || 'User';
        }

        if (elements.userAvatar) {
            elements.userAvatar.textContent = (user.name || user.email || 'U')[0].toUpperCase();
        }

        // Load editor history
        setTimeout(loadChatHistory, 1000); // Give time for dependencies to load

        console.log('User authenticated and UI updated:', user);
    } else {
        // User is not authenticated
        state.userRegistered = false;
        state.currentUser = null;

        // Show login button and hide user profile
        if (elements.loginBtn) elements.loginBtn.classList.remove('hidden');
        if (elements.userProfile) elements.userProfile.classList.remove('active');

        // Clear editor history
        const historySection = document.querySelector('.history-section');
        if (historySection) historySection.innerHTML = '';

        console.log('User not authenticated');
    }

    // Hide message limit warning if user is registered
    if (state.userRegistered && elements.messageLimitWarning) {
        elements.messageLimitWarning.classList.remove('show');
    }
}

// Handle user menu click (logout functionality)
function handleUserMenuClick() {
    if (state.userRegistered && account) {
        if (confirm('Do you want to sign out?')) {
            account.deleteSession('current')
                .then(() => {
                    updateAuthUI(null);
                    state.messageCount = 0;
                    console.log('User signed out successfully');
                })
                .catch(error => {
                    console.error('Sign out failed:', error);
                });
        }
    }
}

// Google Sign In
function signInWithGoogle() {
    if (account) {
        try {
            account.createOAuth2Session(
                'google',
                window.location.origin + '/auth/success',
                window.location.origin + '/auth/error'
            );
        } catch (error) {
            console.error('Google sign-in failed:', error);
            alert('Failed to initiate Google sign-in. Please try again.');
        }
    } else {
        alert('Authentication service not available. Please try again later.');
    }
}

// Handle email sign in
function handleEmailSignIn() {
    const email = document.getElementById('email')?.value;
    if (!email) {
        alert('Please enter your email address.');
        return;
    }

    // Handle email authentication (sign in only)
    if (account) {
        // For demo purposes, simulate authentication
        const mockUser = {
            name: email.split('@')[0],
            email: email,
            $id: 'demo_user_' + Date.now()
        };

        updateAuthUI(mockUser);
        closeModal();
        alert('Signed in successfully! You now have unlimited messages.');
    } else {
        state.userRegistered = true;
        updateAuthUI({ name: email.split('@')[0], email: email });
        closeModal();
        alert('Authentication simulation - you now have unlimited messages!');
    }
}

// Check authentication status
async function checkAuthStatus() {
    if (!account) {
        console.log('Account not available for auth check');
        return;
    }

    try {
        const user = await account.get();

        // Check if this is a new user based on URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const authType = urlParams.get('type');

        if (authType === 'signup') {
            // Show welcome message for new sign-up
            setTimeout(() => {
                alert(`Welcome to XToolab! Your Google account has been linked. You now have unlimited messages.`);
            }, 1000);
        } else if (authType === 'signin') {
            // Show welcome back message
            setTimeout(() => {
                alert(`Welcome back! You're signed in with Google. You have unlimited messages.`);
            }, 1000);
        }

        updateAuthUI(user);
        console.log('User authenticated:', user);
    } catch (error) {
        updateAuthUI(null);
        console.log('User not authenticated:', error.message);
    }
}

function checkAuthFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    
    if (authStatus === 'success') {
        console.log('Auth successful, checking status...');
        setTimeout(() => {
            checkAuthStatus().then(() => {
                // Clean URL
                const cleanUrl = window.location.protocol + "//" + 
                                window.location.host + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            });
        }, 500);
    } else if (authStatus === 'error') {
        alert('Authentication failed. Please try again.');
        // Clean URL
        const cleanUrl = window.location.protocol + "//" + 
                        window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}
// Get session title from editor content (first line or JSON structure)
function getSessionTitleFromContent(content) {
    if (!content || content.trim() === '') return 'Empty Prompt';

    try {
        // Try to parse as JSON and extract meaningful title
        const parsed = JSON.parse(content);

        // Look for common title fields in JSON
        if (parsed.title) return parsed.title.substring(0, 40);
        if (parsed.name) return parsed.name.substring(0, 40);
        if (parsed.prompt) return parsed.prompt.substring(0, 40);
        if (parsed.description) return parsed.description.substring(0, 40);

        // If it's an array, use first item info
        if (Array.isArray(parsed) && parsed[0]) {
            const firstItem = parsed[0];
            if (typeof firstItem === 'string') return firstItem.substring(0, 40);
            if (firstItem.title) return firstItem.title.substring(0, 40);
            if (firstItem.name) return firstItem.name.substring(0, 40);
        }

        return 'JSON Prompt';
    } catch (e) {
        // Not valid JSON, use first line
        const firstLine = content.split('\n')[0].trim();
        if (firstLine.startsWith('//') || firstLine.startsWith('/*')) {
            // Extract comment content
            return firstLine.replace(/^\/\/\s*/, '').replace(/^\/\*\s*/, '').substring(0, 40);
        }
        return firstLine.substring(0, 40) + (firstLine.length > 40 ? '...' : '');
    }
}

// Display editor history in sidebar
function displayEditorHistory(sessions) {
    const historySection = document.querySelector('.history-section');
    if (!historySection) {
        console.log('History section not found in DOM');
        return;
    }

    historySection.innerHTML = '';

    if (sessions.length === 0) {
        historySection.innerHTML = `
            <div class="history-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                No saved prompts yet
            </div>
        `;
        return;
    }

    sessions.forEach(session => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        // Mark active session
        if (session.session_id === state.currentSessionId) {
            historyItem.classList.add('active');
        }

        historyItem.innerHTML = `
            <div class="history-title">${session.session_title || 'Untitled Prompt'}</div>
            <div class="history-date">${formatDate(session.updated_at)}</div>
        `;

        historyItem.addEventListener('click', () => loadEditorSession(session));
        historySection.appendChild(historyItem);
    });
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

// Load a specific editor session
function loadEditorSession(session) {
    // Set current session
    state.currentSessionId = session.session_id;

    // Update active state in history
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.history-item')?.classList.add('active');

    // Switch to editor mode and load content
    switchToChatMode();

    // Load content into Monaco editor
    if (session.editor_content && state.monacoEditor) {
        updateEditorContent(session.editor_content);
    } else if (session.editor_content) {
        // If editor not ready yet, wait and try again
        setTimeout(() => updateEditorContent(session.editor_content), 500);
    }

    console.log('Loaded editor session:', session.session_id);
}

// Auto-save editor content when it changes
function setupEditorAutoSave() {
    if (!state.monacoEditor) return;

    // Save editor content when it changes (with debouncing)
    state.monacoEditor.onDidChangeModelContent(() => {
        if (state.currentUser && databases) {
            // Debounce save calls to avoid too many requests
            clearTimeout(state.saveTimeout);
            state.saveTimeout = setTimeout(saveEditorSession, 2000); // Save after 2 seconds of inactivity
        }
    });
}

// Create new session when starting new prompt
function startNewEditorSession() {
    // Generate new session ID
    state.currentSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Clear editor content
    if (state.monacoEditor) {
        state.monacoEditor.setValue('// New prompt\n// Add your JSON configuration here');
    }

    // Remove active state from history items
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove('active');
    });

    console.log('Started new editor session:', state.currentSessionId);
}

// Initialize Appwrite when the script loads
initAppwrite();