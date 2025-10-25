// Appwrite Configuration - loaded from config.json
let config = null;
let client, account, databases, Query;

// Load configuration from config.json
async function loadConfig() {
    try {
        const response = await fetch('./config.json');
        config = await response.json();
        console.log('DEBUG: Configuration loaded successfully');
        return config;
    } catch (error) {
        console.error('DEBUG: Failed to load configuration:', error);
        throw error;
    }
}

// Initialize Appwrite client (no API key needed for client-side operations)
async function initAppwrite() {
    try {
        // Load configuration first
        await loadConfig();

        console.log('DEBUG: Initializing Appwrite with project ID:', config.appwrite.projectId);
        console.log('DEBUG: Database ID:', config.appwrite.databaseId);
        console.log('DEBUG: Collection ID:', config.appwrite.collectionId);
        console.log('DEBUG: Endpoint:', config.appwrite.endpoint);
        console.log('DEBUG: Current timestamp:', new Date().toISOString());
        console.log('DEBUG: Note: No API key used - relying on Appwrite permissions');

        // Import Appwrite dynamically with proper error handling
        import('https://cdn.jsdelivr.net/npm/appwrite@13.0.1/+esm')
            .then(({ Client, Account, Databases, Query: AppwriteQuery }) => {
                console.log('DEBUG: Appwrite import successful, creating client...');
                client = new Client()
                    .setEndpoint(config.appwrite.endpoint)
                    .setProject(config.appwrite.projectId);

                console.log('DEBUG: Client created, creating account and databases...');
                account = new Account(client);
                databases = new Databases(client);
                Query = AppwriteQuery; // Store Query for use in functions

                console.log('DEBUG: Appwrite initialized successfully');
                console.log('DEBUG: Client endpoint:', client.config.endpoint);
                console.log('DEBUG: Client project:', client.config.project);
                console.log('DEBUG: Account object created:', !!account);
                console.log('DEBUG: Databases object created:', !!databases);

                // Check auth status after initialization
                console.log('DEBUG: Calling checkAuthStatus after initialization...');
                checkAuthStatus();
            })
            .catch(error => {
                console.error('DEBUG: Appwrite initialization failed:', error);
                console.error('DEBUG: Error stack:', error.stack);
            });
    } catch (error) {
        console.error('DEBUG: Appwrite import failed:', error);
        console.error('DEBUG: Error stack:', error.stack);
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
                config.appwrite.databaseId,
                config.appwrite.collectionId,
                state.currentSessionId,
                sessionData
            );
            console.log('Session updated successfully:', state.currentSessionId);
        } catch (error) {
            console.log('Update failed, attempting to create new document:', error.message);
            // If document doesn't exist, create it
            if (error.code === 404 || error.message.includes('Document not found')) {
                await databases.createDocument(
                    config.appwrite.databaseId,
                    config.appwrite.collectionId,
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
        console.log('Using database ID:', config.appwrite.databaseId);
        console.log('Using collection ID:', config.appwrite.collectionId);
        console.log('Appwrite endpoint:', client?.config?.endpoint);

        const response = await databases.listDocuments(
            config.appwrite.databaseId,
            config.appwrite.collectionId,
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
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            type: error.type,
            response: error.response
        });
        // Show empty history on error
        displayEditorHistory([]);
    }
}

// Update UI based on authentication status
function updateAuthUI(user = null) {
    console.log('DEBUG: updateAuthUI called with user:', user ? 'present' : 'null');
    if (user && elements.loginBtn && elements.userProfile) {
        // User is authenticated
        console.log('DEBUG: User authenticated, updating UI for logged in state');
        state.userRegistered = true;
        state.currentUser = user;

        // Hide login button and show user profile
        elements.loginBtn.classList.add('hidden');
        elements.userProfile.classList.add('active');

        // Update user info
        if (elements.userName) {
            elements.userName.textContent = user.name || user.email || 'User';
            console.log('DEBUG: Updated user name to:', elements.userName.textContent);
        }

        if (elements.userAvatar) {
            elements.userAvatar.textContent = (user.name || user.email || 'U')[0].toUpperCase();
            console.log('DEBUG: Updated user avatar to:', elements.userAvatar.textContent);
        }

        // Load editor history
        console.log('DEBUG: Scheduling loadChatHistory in 1 second...');
        setTimeout(loadChatHistory, 1000); // Give time for dependencies to load

        console.log('DEBUG: User authenticated and UI updated:', user);
    } else {
        // User is not authenticated
        console.log('DEBUG: User not authenticated, updating UI for logged out state');
        state.userRegistered = false;
        state.currentUser = null;

        // Show login button and hide user profile
        if (elements.loginBtn) elements.loginBtn.classList.remove('hidden');
        if (elements.userProfile) elements.userProfile.classList.remove('active');

        // Clear editor history
        const historySection = document.querySelector('.history-section');
        if (historySection) {
            historySection.innerHTML = '';
            console.log('DEBUG: Cleared editor history');
        }

        console.log('DEBUG: User not authenticated, UI updated to logged out state');
    }

    // Hide message limit warning if user is registered
    if (state.userRegistered && elements.messageLimitWarning) {
        elements.messageLimitWarning.classList.remove('show');
        console.log('DEBUG: Hid message limit warning for registered user');
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
    console.log('DEBUG: signInWithGoogle called');
    console.log('DEBUG: account available:', !!account);
    console.log('DEBUG: client available:', !!client);
    console.log('DEBUG: current URL:', window.location.href);

    if (account) {
        try {
            const successUrl = window.location.origin;
            const failureUrl = window.location.origin + '/auth/error';
            console.log('DEBUG: Creating OAuth2 session with success URL:', successUrl, 'failure URL:', failureUrl);

            account.createOAuth2Session(
                'google',
                successUrl,  // Success URL is the current page
                failureUrl
            );
            console.log('DEBUG: OAuth2 session creation initiated');
        } catch (error) {
            console.error('DEBUG: Google sign-in failed:', error);
            console.error('DEBUG: Error stack:', error.stack);
            alert('Failed to initiate Google sign-in. Please try again.');
        }
    } else {
        console.error('DEBUG: Account not available for sign-in');
        console.error('DEBUG: Appwrite initialization status - client:', !!client, 'databases:', !!databases);
        alert('Authentication service not available. Please try again later.');
    }
}

// Handle email sign in - REMOVED: Insecure demo authentication
function handleEmailSignIn() {
    alert('Email authentication is not available in this secure configuration. Please use Google OAuth for authentication.');
}

// Check authentication status
async function checkAuthStatus() {
    console.log('DEBUG: checkAuthStatus called');
    if (!account) {
        console.log('DEBUG: Account not available for auth check');
        return;
    }

    try {
        console.log('DEBUG: Attempting to get account info...');
        const user = await account.get();
        console.log('DEBUG: Account.get() succeeded, user:', user);

        // Check if this is a new user based on URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const authType = urlParams.get('type');
        console.log('DEBUG: URL params - type:', authType);

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
        console.log('DEBUG: User authenticated successfully:', user);
    } catch (error) {
        console.log('DEBUG: Account.get() failed, error:', error);
        console.log('DEBUG: Error code:', error.code, 'type:', error.type);
        updateAuthUI(null);
        console.log('DEBUG: User not authenticated, UI updated to logged out state');
    }
}

function checkAuthFromURL() {
    console.log('DEBUG: checkAuthFromURL called');
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const authType = urlParams.get('type');
    console.log('DEBUG: URL params - auth:', authStatus, 'type:', authType);
    console.log('DEBUG: Full URL:', window.location.href);

    if (authStatus === 'success') {
        console.log('DEBUG: Auth successful, checking status...');
        setTimeout(() => {
            checkAuthStatus().then(() => {
                console.log('DEBUG: checkAuthStatus completed after URL auth success');
                // Clean URL
                const cleanUrl = window.location.protocol + "//" +
                                window.location.host + window.location.pathname;
                console.log('DEBUG: Cleaning URL to:', cleanUrl);
                window.history.replaceState({}, document.title, cleanUrl);
            }).catch(error => {
                console.error('DEBUG: checkAuthStatus failed after URL auth success:', error);
            });
        }, 500);
    } else if (authStatus === 'error') {
        console.log('DEBUG: Auth error detected in URL');
        alert('Authentication failed. Please try again.');
        // Clean URL
        const cleanUrl = window.location.protocol + "//" +
                        window.location.host + window.location.pathname;
        console.log('DEBUG: Cleaning URL after auth error to:', cleanUrl);
        window.history.replaceState({}, document.title, cleanUrl);
    } else {
        console.log('DEBUG: No auth status in URL');
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
        const svgContent = `
            <div class="history-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                No saved prompts yet
            </div>
        `;
        console.log('Setting history section innerHTML:', svgContent);
        historySection.innerHTML = svgContent;
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
// Initialize Appwrite when the script loads
(async () => {
    await initAppwrite();
    // Check for auth status from URL parameters on page load
    checkAuthFromURL();
})();

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