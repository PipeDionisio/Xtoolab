// CONFIGURACIÓN - Cambia este valor para modificar el límite de mensajes
const MAX_FREE_MESSAGES = 3;

// DOM elements
const elements = {
    sidebar: document.getElementById('sidebar'),
    mainContent: document.getElementById('mainContent'),
    welcomeSection: document.getElementById('welcomeSection'),
    messagesContainer: document.getElementById('messagesContainer'),
    editorContainer: document.getElementById('editorContainer'),
    editorContent: document.getElementById('editorContent'),
    responseContent: document.getElementById('responseContent'),
    responseTab: document.getElementById('responseTab'),
    messageInput: document.getElementById('messageInput'),
    messageInputFixed: document.getElementById('messageInputFixed'),
    chatInputFixed: document.getElementById('chatInputFixed'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    togglePanelBtn: document.getElementById('togglePanelBtn'),
    registerModal: document.getElementById('registerModal'),
    monacoResponse: document.getElementById('monaco-response'),
    loginBtn: document.getElementById('loginBtn'),
    userProfile: document.getElementById('userProfile'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    messageLimitWarning: document.getElementById('messageLimitWarning'),
    dynamicBottomText: document.getElementById('dynamicBottomText')
};

// App state
const state = {
    isPanelHidden: false,
    isChatMode: false,
    currentSessionId: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),        
    messageCount: 0,
    userRegistered: false,
    monacoEditor: null,
    currentEditorTab: 'editor',
    currentUser: null,
    imageProcessor: null,
    saveTimeout: null
};

// Initialize Appwrite and Databases with your API key
let client, account, databases, Query;
const DATABASE_ID = '678c3e6f002d66845fa3'; // Your actual database ID
const COLLECTION_ID = 'chat_sessions';
const PROJECT_ID = '68c3345200239a1d1d37'; // Your project ID
const API_KEY = 'standard_7f0fab0dee07b5468ad40aa5332905149033dda09e109ef6c0f525b11c672a62cd926373e67d749857be815a4e7d4c1cf0ac817c38952c91129e0f74a3e2524b8069b43010b3617b99c80db8f2e1f1c02d66a1b6d07fe800a3500e76471d39b4b80ec98335582274f088b29bc38496eba8ef6550480a5cb4684e07e5f01f274a';

try {
    // Import Appwrite dynamically with proper error handling
    import('https://cdn.jsdelivr.net/npm/appwrite@13.0.1/+esm')
        .then(({ Client, Account, Databases, Query: AppwriteQuery }) => {
            client = new Client()
                .setEndpoint('https://nyc.cloud.appwrite.io/v1')
                .setProject(PROJECT_ID)
                .setKey(API_KEY); // Add API key for server operations
            
            account = new Account(client);
            databases = new Databases(client);
            Query = AppwriteQuery; // Store Query for use in functions

            console.log('Appwrite initialized successfully with API key');
            
            // Check auth status after initialization
            checkAuthStatus();
        })
        .catch(error => {
            console.log('Appwrite initialization failed:', error);
        });
} catch (error) {
    console.log('Appwrite import failed:', error);
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
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 2-2V8z"/>
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

// Initialize Monaco Editor
function initMonacoEditor() {
    if (typeof require === 'undefined') {
        console.error('Monaco Editor loader not available');
        return;
    }

    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' }});   

    require(['vs/editor/editor.main'], function() {
        try {
            state.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: '// Your JSON prompt will appear here\n// Send a message to get started',
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                minimap: { enabled: false },
                readOnly: false,
                wordWrap: 'on',
                wordWrapColumn: 80,
                wrappingIndent: 'indent',
                scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                    alwaysConsumeMouseWheel: false
                },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false,
                renderLineHighlight: 'line',
                contextmenu: true,
                mouseWheelZoom: false,
                smoothScrolling: true,
                cursorBlinking: 'blink',
                cursorSmoothCaretAnimation: true,
                lineHeight: 20,
                padding: {
                    top: 10,
                    bottom: 10
                },
                folding: true,
                foldingStrategy: 'indentation',
                showFoldingControls: 'always',
                unfoldOnClickAfterEndOfLine: false,
                selectOnLineNumbers: true
            });

            console.log('Monaco Editor initialized successfully');
            
            // Setup auto-save functionality
            setupEditorAutoSave();

            // Add resize listener to ensure editor fits properly
            const editorElement = document.getElementById('monaco-editor');
            const resizeObserver = new ResizeObserver(() => {
                if (state.monacoEditor) {
                    state.monacoEditor.layout();
                }
            });
            
            if (editorElement) {
                resizeObserver.observe(editorElement);
            }

            // Ensure proper initial layout
            setTimeout(() => {
                if (state.monacoEditor) {
                    state.monacoEditor.layout();
                }
            }, 100);

        } catch (error) {
            console.error('Error initializing Monaco Editor:', error);
        }
    });
}

// Switch between editor tabs
function switchEditorTab(tabName) {
    // Update active tab
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show active content
    document.querySelectorAll('.editor-content').forEach(content => {
        content.classList.toggle('active', content.id === tabName + 'Content');
    });

    state.currentEditorTab = tabName;

    // If switching to editor tab, resize the editor
    if (tabName === 'editor' && state.monacoEditor) {
        setTimeout(() => state.monacoEditor.layout(), 100);
    }
}

// Update Monaco Editor content
function updateEditorContent(content) {
    if (state.monacoEditor) {
        state.monacoEditor.setValue(content);
    } else {
        // If editor not initialized yet, wait and try again
        setTimeout(() => updateEditorContent(content), 500);
    }
}

// Update response content
function updateResponseContent(content) {
    if (!elements.monacoResponse) return;

    // Clear existing content
    elements.monacoResponse.innerHTML = '';

    // Handle DOM elements directly (like images)
    if (content && typeof content === 'object' && content.nodeType === Node.ELEMENT_NODE) {
        elements.monacoResponse.appendChild(content);
    }
    // Handle HTML strings (but re-attach event listeners for images)
    else if (content && typeof content === 'string' && content.includes('<')) {
        elements.monacoResponse.innerHTML = content;
        // Re-attach click handlers to images that lost their event listeners
        reattachImageEventListeners();
    }
    // Handle plain text content
    else {
        elements.monacoResponse.textContent = content || '';
    }
}

// Re-attach event listeners to images after innerHTML insertion
function reattachImageEventListeners() {
    const images = elements.monacoResponse.querySelectorAll('.image-response-container img');
    images.forEach(img => {
        if (!img.hasAttribute('data-download-attached')) {
            attachImageDownloadHandler(img);
            img.setAttribute('data-download-attached', 'true');
        }
    });
}

// Attach download functionality to an image element
function attachImageDownloadHandler(imageElement) {
    // Get the blob data from the src (reconstruct from object URL if needed)
    const handleDownload = async function(event) {
        event.preventDefault();
        
        try {
            // Show download feedback
            showDownloadFeedback('Preparing download...');
            
            // Get the image source
            const imageSrc = this.src;
            const fileExtension = this.dataset.fileExtension || 'jpg';
            
            if (this.blobData) {
                // Use stored blob data if available
                downloadImageFromBlob(this.blobData, fileExtension);
            } else if (imageSrc.startsWith('blob:')) {
                // Fetch the blob from the object URL
                const response = await fetch(imageSrc);
                const blob = await response.blob();
                downloadImageFromBlob(blob, fileExtension);
            } else {
                // Fallback: fetch from regular URL
                const response = await fetch(imageSrc);
                const blob = await response.blob();
                downloadImageFromBlob(blob, fileExtension);
            }
            
        } catch (error) {
            console.error('Error downloading image:', error);
            showDownloadFeedback('Download failed. Please try again.', true);
        }
    };
    
    imageElement.addEventListener('click', handleDownload);
    imageElement.style.cursor = 'pointer';
    imageElement.title = 'Click to download image';
}

// Download image from blob data
function downloadImageFromBlob(blob, fileExtension) {
    try {
        const link = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = `generated-image-${Date.now()}.${fileExtension}`;
        
        // Add to DOM temporarily for cross-browser compatibility
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        
        // Clean up
        document.body.removeChild(link);
        
        // Clean up the object URL after a delay to ensure download started
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
        console.error('Error downloading image blob:', error);
    }
}

// Show download feedback function (referenced but missing)
function showDownloadFeedback(message, isError = false) {
    // Create or update download feedback element
    let feedbackElement = document.getElementById('download-feedback');
    if (!feedbackElement) {
        feedbackElement = document.createElement('div');
        feedbackElement.id = 'download-feedback';
        feedbackElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(feedbackElement);
    }
    
    feedbackElement.textContent = message;
    feedbackElement.style.backgroundColor = isError ? '#ef4444' : '#22c55e';
    feedbackElement.style.opacity = '1';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        feedbackElement.style.opacity = '0';
    }, 3000);
}

// Update dynamic bottom text
function updateDynamicBottomText(content, isLoading = false, isError = false) {
    if (!elements.dynamicBottomText) return;
    
    elements.dynamicBottomText.textContent = content;
    elements.dynamicBottomText.style.color = '#a1a1a1';
}

// Show message limit warning
function showMessageLimitWarning() {
    if (elements.messageLimitWarning && !state.userRegistered) {
        elements.messageLimitWarning.classList.add('show');
        setTimeout(() => {
            elements.messageLimitWarning.classList.remove('show');
        }, 5000);
    }
}

// Toggle sidebar visibility
function toggleSidebar() {
    if (elements.sidebar) {
        elements.sidebar.classList.toggle('hidden');
    }
}

// Toggle panel visibility
function togglePanel() {
    state.isPanelHidden = !state.isPanelHidden;

    if (state.isPanelHidden) {
        elements.sidebar?.classList.add('hidden');
        elements.mainContent?.classList.add('full-width');
        if (state.isChatMode) {
            elements.chatInputFixed?.classList.add('full-width');
        }
        // Update toggle button icon
        if (elements.togglePanelBtn) {
            elements.togglePanelBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="9" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="9" y1="18" x2="21" y2="18"/>
                </svg>
            `;
        }
    } else {
        elements.sidebar?.classList.remove('hidden');
        elements.mainContent?.classList.remove('full-width');
        if (state.isChatMode) {
            elements.chatInputFixed?.classList.remove('full-width');
        }
        // Revert toggle button icon
        if (elements.togglePanelBtn) {
            elements.togglePanelBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="6" x2="15" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="15" y2="18"/>
                </svg>
            `;
        }
    }
}

// Start a new chat session
function startNewChat() {
    // Clear chat messages
    if (elements.messagesContainer) {
        elements.messagesContainer.innerHTML = '';
        elements.messagesContainer.style.display = 'none';
    }
    if (elements.editorContainer) {
        elements.editorContainer.style.display = 'none';
    }
    if (elements.welcomeSection) {
        elements.welcomeSection.style.display = 'block';
    }
    if (elements.chatInputFixed) {
        elements.chatInputFixed.style.display = 'none';
    }

    state.isChatMode = false;

    // Start new editor session
    startNewEditorSession();

    console.log('Starting new chat...');
}

// Send message to API
async function sendToAPI(message, webhookUrl, editorContent) {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                sessionId: state.currentSessionId,
                prompt: editorContent
            })
        });

        if (response.ok) {
            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return parseApiResponse(data);
            } else if (contentType && (contentType.includes('image/') || contentType.includes('application/octet-stream'))) {
                // Handle binary responses (images)
                const arrayBuffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                return parseApiResponse(uint8Array, contentType);
            } else {
                // Handle text responses
                const textData = await response.text();
                console.log('Received text response:', textData.substring(0, 100) + '...');
                return parseApiResponse(textData);
            }
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

// Show registration modal
function showRegistrationModal() {
    if (elements.registerModal) {
        elements.registerModal.style.display = 'flex';
    }
}

// Close modal
function closeModal() {
    if (elements.registerModal) {
        elements.registerModal.style.display = 'none';
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

// Check for authentication success from URL parameters
function checkAuthFromURL() {
    const urlParams = new URLSearchParams(window.location.search);

    // Check if we're on a success page or have success parameters
    if (window.location.pathname.includes('auth/success') || urlParams.get('success')) {
        // Auth was successful, check status
        setTimeout(checkAuthStatus, 1000);

        // Clean up URL after processing
        setTimeout(() => {
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }, 2000);
    }
}

// Send message from main input
async function sendMessage() {
    const message = elements.messageInput?.value.trim();

    if (message) {
        await processMessage(message);
    }
}

// Send message from fixed input
async function sendMessageFixed() {
    const message = elements.messageInputFixed?.value.trim();

    if (message) {
        await processMessage(message, true);
    }
}

// Process message (shared functionality)
async function processMessage(message, isFixed = false) {
    // Check if user has reached message limit
    if (state.messageCount >= MAX_FREE_MESSAGES && !state.userRegistered) {
        showMessageLimitWarning();
        showRegistrationModal();
        return;
    }

    // Switch to chat mode if not already
    switchToChatMode();

    // Add user message to chat
    addMessage(message, 'user');

    // Increment message count for non-registered users
    if (!state.userRegistered) {
        state.messageCount++;
    }

    // Clear input
    const inputElement = isFixed ? elements.messageInputFixed : elements.messageInput;
    if (inputElement) {
        inputElement.value = '';
        inputElement.style.height = 'auto';
    }

    // Show loading indicator
    if (elements.loadingIndicator) {
        elements.loadingIndicator.style.display = 'block';
    }

    try {
        // Send message to API
        const botResponse = await sendToAPI(message, 'https://7144fb0822b5.ngrok-free.app/webhook/f07ef21d-dae3-45ce-b457-57541e686137');

        // Update Monaco Editor with the response
        updateEditorContent(botResponse);

        // Save the editor session after updating content
        if (state.currentUser) {
            setTimeout(saveEditorSession, 1000);
        }

        // After updating editor, send editor content to second webhook for dynamic bottom text       
        setTimeout(async () => {
            try {
                updateDynamicBottomText('Loading...', true); // Show loading state

                const editorContent = state.monacoEditor ? state.monacoEditor.getValue() : botResponse;
                const dynamicResponse = await sendToAPI(editorContent, 'https://7144fb0822b5.ngrok-free.app/webhook/78ec2241-6c9e-4d60-87ef-d1f30efec796');

                // Update dynamic bottom text with response
                updateDynamicBottomText(dynamicResponse);
            } catch (error) {
                console.error('Error with dynamic bottom text webhook:', error);
                updateDynamicBottomText('Failed to load dynamic content', false, true);
            }
        }, 500); 

    } catch (error) {
        updateEditorContent("// Sorry, I'm having trouble connecting to the server.\n// Please try again later.");
        updateDynamicBottomText('Connection error', false, true);
    } finally {
        // Hide loading indicator
        if (elements.loadingIndicator) {
            elements.loadingIndicator.style.display = 'none';
        }

        // Check if we need to show the modal after this message
        if (state.messageCount >= MAX_FREE_MESSAGES && !state.userRegistered) {
            setTimeout(() => {
                showMessageLimitWarning();
                showRegistrationModal();
            }, 1000);
        }
    }
}

// Send editor content to webhook
async function sendEditorContent() {
    if (!state.monacoEditor) {
        alert('Editor is not ready yet. Please try again.');
        return;
    }

    const editorContent = state.monacoEditor.getValue().trim();

    if (!editorContent) {
        alert('Editor is empty. Please add some content first.');
        return;
    }

    // Show loading indicator
    if (elements.loadingIndicator) {
        elements.loadingIndicator.style.display = 'block';
    }

    try {
        switchEditorTab('response');
        // Send editor content to the specified webhook
        const response = await sendToAPI(editorContent, 'https://7144fb0822b5.ngrok-free.app/webhook/generate-image');

        // Update response content and switch to response tab
        updateResponseContent(response);

    } catch (error) {
        console.error('Error sending editor content:', error);
        updateResponseContent('Error: Unable to process content. Please try again.');
    } finally {
        // Hide loading indicator
        if (elements.loadingIndicator) {
            elements.loadingIndicator.style.display = 'none';
        }
    }
}

// Add message to chat
function addMessage(text, sender) {
    if (!elements.messagesContainer) return;

    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    // Create avatar
    const avatar = document.createElement('div');
    avatar.classList.add('message-avatar');
    avatar.textContent = sender === 'user' ? 'U' : 'X';

    // Create content container
    const content = document.createElement('div');
    content.classList.add('message-content');
    content.textContent = text;

    // Add elements to message
    messageElement.appendChild(avatar);
    messageElement.appendChild(content);

    elements.messagesContainer.appendChild(messageElement);

    // Scroll to bottom of chat
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// Handle key press in text inputs
function handleKeyPress(event, inputElement) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (inputElement.id === 'messageInputFixed') {
            sendMessageFixed();
        } else {
            sendMessage();
        }
    }

    // Auto-resize textarea
    inputElement.style.height = 'auto';
    inputElement.style.height = inputElement.scrollHeight + 'px';
}

// Switch to chat mode
function switchToChatMode() {
    if (!state.isChatMode) {
        state.isChatMode = true;
        if (elements.welcomeSection) elements.welcomeSection.style.display = 'none';
        if (elements.messagesContainer) elements.messagesContainer.style.display = 'none';
        if (elements.editorContainer) elements.editorContainer.style.display = 'block';
        if (elements.chatInputFixed) elements.chatInputFixed.style.display = 'block';

        if (state.isPanelHidden && elements.chatInputFixed) {
            elements.chatInputFixed.classList.add('full-width');
        }
    }
}

// Parse API response data
function parseApiResponse(data, contentType = null) {
    try {
        // Handle null or undefined
        if (!data) {
            return "No response data received";
        }

        // Handle binary data (Uint8Array)
        if (data instanceof Uint8Array) {
            return createImageFromBinaryData(data, contentType);
        }

        // Handle string responses first
        if (typeof data === 'string') {
            // Check if this looks like binary data (starts with non-printable characters)
            if (data.length > 0 && data.charCodeAt(0) < 32 && data.charCodeAt(0) !== 10 && data.charCodeAt(0) !== 13) {
                return "Received binary data (likely an image or file). Cannot display as text.";
            }
            // Check for common binary file signatures
            if (data.startsWith('\xFF\xD8\xFF') || data.startsWith('\x89PNG') || data.startsWith('GIF8') || data.startsWith('RIFF')) {
                return "Received image data. Cannot display binary content as text.";
            }
            return data;
        }

        // Quick debug - just log the keys for object responses
        if (data && typeof data === 'object') {
            console.log("API Response Keys:", Object.keys(data));
        }

        // Handle object responses
        if (typeof data === 'object' && data !== null) {
            // Handle array responses
            if (Array.isArray(data) && data.length > 0) {
                if (data[0] && typeof data[0] === 'object') {
                    if (data[0].output) return data[0].output;
                    if (data[0].response) return data[0].response;
                    if (data[0].text) return data[0].text;
                    if (data[0].content) return data[0].content;
                }
                if (typeof data[0] === 'string') return data[0];
                return JSON.stringify(data[0], null, 2);
            }
            // Handle single object responses
            else {
                // Check common response fields
                if (data.output) return data.output;
                if (data.response) return data.response;
                if (data.message) return data.message;
                if (data.text) return data.text;
                if (data.content) return data.content;
                if (data.result) return data.result;
                if (data.data) return data.data;
                if (data.generated_text) return data.generated_text;
                if (data.completion) return data.completion;

                // OpenAI format
                if (data.choices && Array.isArray(data.choices) && data.choices[0]) {
                    if (data.choices[0].message && data.choices[0].message.content) {
                        return data.choices[0].message.content;
                    }
                    if (data.choices[0].text) return data.choices[0].text;
                }

                // Show available keys for debugging
                const keys = Object.keys(data).slice(0, 5).join(', ');
                return `Response object found with keys: ${keys}. Please check which key contains your content.`;
            }
        }

        // Fallback
        return "Unexpected response type: " + typeof data;

    } catch (error) {
        console.error("Error parsing API response:", error);
        return "Error parsing response: " + error.message;
    }
}

// Enhanced create image element from binary data with responsive processing
function createImageFromBinaryData(uint8Array, contentType) {
    console.log('DEBUG: createImageFromBinaryData called with contentType:', contentType);
    try {
        // Use ImageProcessor if available, otherwise fall back to original method
        if (state.imageProcessor) {
            console.log('DEBUG: Using enhanced ImageProcessor for binary data');
            return state.imageProcessor.createResponsiveImageFromBinaryData(uint8Array, contentType);
        } else {
            console.warn('DEBUG: ImageProcessor not available, using fallback method');
            return createImageFromBinaryDataFallback(uint8Array, contentType);
        }
    }
    // TEMPORARY: Adding catch to prevent syntax error while debugging
    catch (error) {
        console.error('DEBUG: Error in createImageFromBinaryData:', error);
        return createImageFromBinaryDataFallback(uint8Array, contentType);
    }
}

// Fallback method (original implementation)
function createImageFromBinaryDataFallback(uint8Array, contentType) {
    try {
        // Convert Uint8Array to Blob
        const blob = new Blob([uint8Array], { type: contentType || 'image/jpeg' });

        // Create object URL for the blob
        const imageUrl = URL.createObjectURL(blob);

        // Determine file extension from content type
        let fileExtension = 'jpg';
        if (contentType) {
            const mimeType = contentType.split('/')[1];
            if (mimeType === 'jpeg') fileExtension = 'jpg';
            else if (mimeType === 'png') fileExtension = 'png';
            else if (mimeType === 'gif') fileExtension = 'gif';
            else if (mimeType === 'webp') fileExtension = 'webp';
            else if (mimeType === 'svg+xml') fileExtension = 'svg';
            else fileExtension = mimeType || 'jpg';
        }

        // Create image element
        const imageElement = document.createElement('img');
        
        // Store blob data and file extension for download functionality
        imageElement.blobData = blob;
        imageElement.dataset.fileExtension = fileExtension;
        imageElement.src = imageUrl;
        imageElement.style.maxWidth = '100%';
        imageElement.style.height = 'auto';
        imageElement.style.borderRadius = '8px';
        imageElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        imageElement.style.transition = 'opacity 0.3s ease, transform 0.2s ease, box-shadow 0.2s ease';
        imageElement.loading = 'lazy';
        
        // Add hover effects
        imageElement.addEventListener('mouseenter', function() {
            this.style.opacity = '0.8';
            this.style.transform = 'scale(1.02)';
            this.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
        });
        
        imageElement.addEventListener('mouseleave', function() {
            this.style.opacity = '1';
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        });

        // Attach download functionality using the original handler
        attachImageDownloadHandler(imageElement);

        // Create container for the image
        const container = document.createElement('div');
        container.className = 'image-response-container';
        container.appendChild(imageElement);

        // Return DOM element directly instead of HTML string to preserve event listeners
        return container;

    } catch (error) {
        console.error('Error creating image from binary data (fallback):', error);
        return "Error displaying image: " + error.message;
    }
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', function(event) {
    const menuToggle = document.querySelector('.menu-toggle');

    if (window.innerWidth <= 768 &&
        elements.sidebar &&
        !elements.sidebar.contains(event.target) &&
        menuToggle && !menuToggle.contains(event.target) &&
        !elements.sidebar.classList.contains('hidden')) {
        elements.sidebar.classList.add('hidden');
    }
});

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('XToolab initialized with session ID:', state.currentSessionId);
    console.log('Free message limit:', MAX_FREE_MESSAGES);
    console.log('Database ID:', DATABASE_ID);
    console.log('API Key configured:', !!API_KEY);
    
    checkAuthFromURL();

    // Initialize ImageProcessor
    if (window.ImageProcessor) {
        state.imageProcessor = new ImageProcessor();
        
        // Start observing the response container
        if (elements.monacoResponse) {
            state.imageProcessor.observeContainer(elements.monacoResponse);
        }
        
        console.log('ImageProcessor initialized and observing response container');
    }

    // Add event listeners for textareas
    const messageInput = document.getElementById('messageInput');
    const messageInputFixed = document.getElementById('messageInputFixed');

    if (messageInput) {
        messageInput.addEventListener('keydown', function(event) {
            handleKeyPress(event, this);
        });
    }

    if (messageInputFixed) {
        messageInputFixed.addEventListener('keydown', function(event) {
            handleKeyPress(event, this);
        });
    }
});

// Initialize Monaco Editor when page loads
window.addEventListener('load', function() {
    initMonacoEditor();

    // Double-check auth status after everything loads
    setTimeout(checkAuthStatus, 2000);
});