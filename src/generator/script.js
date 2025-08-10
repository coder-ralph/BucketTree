let currentFilter = 'all';
let treeData = '';

// Clear button functionality
const repoUrlInput = document.getElementById('repoUrl');
const clearBtn = document.getElementById('clearBtn');

function toggleClearButton() {
    if (repoUrlInput.value.trim()) {
        clearBtn.classList.add('show');
    } else {
        clearBtn.classList.remove('show');
    }
}

repoUrlInput.addEventListener('input', toggleClearButton);

clearBtn.addEventListener('click', () => {
    repoUrlInput.value = '';
    toggleClearButton();
    // Clear output when input is cleared
    treeData = '';
    document.getElementById('outputTree').textContent = '';
    document.getElementById('outputTree').style.display = 'none';
    document.getElementById('outputPlaceholder').style.display = 'flex';
    document.getElementById('actions').classList.remove('show');
    document.getElementById('errorMessage').classList.remove('show');
});

// Example button functionality
document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        repoUrlInput.value = url;
        toggleClearButton();
        repoUrlInput.focus();
    });
});

// Options functionality (if you plan to add them back)
document.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.option-item').forEach(opt => opt.classList.remove('active'));
        item.classList.add('active');
        currentFilter = item.dataset.option;
    });
});

document.getElementById('generateBtn').addEventListener('click', async () => {
    const repoUrl = document.getElementById('repoUrl').value.trim();
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.classList.remove('show');

    if (!repoUrl) {
        showError('Repository URL is required');
        return;
    }
    if (!repoUrl.includes('bitbucket.org')) {
        showError('Enter a valid Bitbucket URL');
        return;
    }
    await generateTree(repoUrl);
});

document.getElementById('copyBtn').addEventListener('click', () => {
    if (treeData) {
        navigator.clipboard.writeText(treeData).then(() => {
            showToast('Copied to clipboard!');
        });
    }
});

document.getElementById('exportBtn').addEventListener('click', () => {
    if (treeData) {
        const blob = new Blob([treeData], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'README.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('README.md exported!');
    }
});

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => errorMessage.classList.remove('show'), 5000);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--success-color);
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
        style.remove();
    }, 3000);
}

async function generateTree(repoUrl) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const outputPlaceholder = document.getElementById('outputPlaceholder');
    const outputTree = document.getElementById('outputTree');
    const actions = document.getElementById('actions');
    const generateBtn = document.getElementById('generateBtn');

    loadingOverlay.classList.add('show');
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
        const { workspace, repoSlug } = extractRepoInfo(repoUrl);
        const tree = await fetchRepoTree(workspace, repoSlug);
        treeData = tree;
        outputPlaceholder.style.display = 'none';
        outputTree.style.display = 'block';
        outputTree.textContent = tree;
        actions.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        showError('❌ Error fetching repository structure. Please check the URL and try again.');
        outputPlaceholder.style.display = 'flex';
        outputTree.style.display = 'none';
        actions.classList.remove('show');
    } finally {
        loadingOverlay.classList.remove('show');
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }
}

function extractRepoInfo(url) {
    const parts = url.replace(/\/$/, '').split('/');
    if (parts.length < 5) throw new Error('Invalid repository URL');
    return {
        workspace: parts[3],
        repoSlug: parts[4].replace('.git', '')
    };
}

async function fetchRepoTree(workspace, repoSlug) {
    const branch = 'master';
    const allFiles = [];
    
    async function fetchDirectory(path = '') {
        const apiUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/src/${branch}/${path}`;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                if (response.status === 404) throw new Error('Repository not found');
                if (response.status === 403) throw new Error('Access denied - repository may be private');
                throw new Error(`API request failed with status ${response.status}`);
            }
            const data = await response.json();
            
            if (!data.values) return;
            
            for (const item of data.values) {
                const itemPath = item.path || item.name;
                const fullPath = path ? `${path}/${itemPath}` : itemPath;
                
                // Check if it's a directory (multiple possible type values)
                if (item.type === 'commit_directory' || item.type === 'directory') {
                    // Add directory to the list
                    allFiles.push(fullPath + '/');
                    // Recursively fetch directory contents
                    await fetchDirectory(fullPath);
                } else if (item.type === 'commit_file' || item.type === 'file' || !item.type) {
                    // It's a file (handle different possible type values or missing type)
                    allFiles.push(fullPath);
                }
            }
        } catch (error) {
            console.warn(`Warning: Could not fetch directory ${path}:`, error.message);
        }
    }
    
    await fetchDirectory();
    
    if (allFiles.length === 0) throw new Error('No files found in repository');
    
    // Remove duplicates and sort
    const uniqueFiles = [...new Set(allFiles)].sort();
    
    return generateAsciiTree(uniqueFiles);
}

function generateAsciiTree(paths) {
    if (paths.length === 0) return 'No files match the selected filter.';
    
    // Sort paths to ensure proper tree structure
    const sortedPaths = paths.sort();
    const tree = {};
    
    sortedPaths.forEach(path => {
        // Remove trailing slash for directories to handle them properly
        const cleanPath = path.replace(/\/$/, '');
        const parts = cleanPath.split('/').filter(part => part);
        
        let current = tree;
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        });
    });
    
    let result = '';
    function buildTree(obj, prefix = '') {
        const entries = Object.keys(obj).sort((a, b) => {
            // Sort directories first, then files
            const aHasChildren = Object.keys(obj[a]).length > 0;
            const bHasChildren = Object.keys(obj[b]).length > 0;
            
            if (aHasChildren && !bHasChildren) return -1;
            if (!aHasChildren && bHasChildren) return 1;
            return a.localeCompare(b);
        });
        
        entries.forEach((key, index) => {
            const isLast = index === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const extension = isLast ? '    ' : '│   ';
            
            result += prefix + connector + key + '\n';
            
            if (Object.keys(obj[key]).length > 0) {
                buildTree(obj[key], prefix + extension);
            }
        });
    }
    
    buildTree(tree);
    return result || 'Repository is empty.';
}

document.getElementById('repoUrl').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        document.getElementById('generateBtn').click();
    }
});

// Clear output when Repository URL is cleared
document.getElementById('repoUrl').addEventListener('input', () => {
    const repoUrl = document.getElementById('repoUrl').value.trim();
    if (!repoUrl) {
        treeData = '';
        document.getElementById('outputTree').textContent = '';
        document.getElementById('outputTree').style.display = 'none';
        document.getElementById('outputPlaceholder').style.display = 'flex';
        document.getElementById('actions').classList.remove('show');
    }
});

// Initialize clear button state
toggleClearButton();