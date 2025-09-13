/**
 * API Utilities for Roster Management
 */

// Generic API call function
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ROSTER_TOKEN}`
        }
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { detail: errorText || 'Unknown error' };
            }
            
            const error = new Error(errorData.detail || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = errorData;
            throw error;
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Load clan members for search suggestions
async function loadClanMembers() {
    try {
        const response = await apiCall(`${API_BASE}/roster/server/${serverId}/members`, 'GET');
        clanMembers = response.members || [];
        console.log(`Loaded ${clanMembers.length} clan members for search`);
    } catch (error) {
        console.error('Error loading clan members:', error);
        clanMembers = [];
    }
}

// Show alert message
function showAlert(message, type = 'success') {
    const alertsContainer = document.getElementById('alerts');
    if (!alertsContainer) return;

    const alertDiv = document.createElement('div');
    alertDiv.className = `px-4 py-3 rounded-md shadow-lg max-w-sm transition-all duration-300 ${
        type === 'success' ? 'bg-green-500 text-white' : 
        type === 'error' ? 'bg-destructive text-destructive-foreground' : 
        'bg-yellow-500 text-white'
    }`;
    alertDiv.textContent = message;

    alertsContainer.appendChild(alertDiv);

    // Auto remove after 4 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.style.opacity = '0';
            alertDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 300);
        }
    }, 4000);
}

// Handle member addition errors with specific messages
function handleMemberAddError(error, memberTags) {
    console.error('Member addition error:', error);
    
    if (error.status === 400) {
        showAlert('Invalid player tag format', 'error');
    } else if (error.status === 404) {
        showAlert('Player not found or not accessible', 'error');
    } else if (error.status === 422) {
        if (error.data && error.data.detail) {
            if (error.data.detail.includes('already exists')) {
                showAlert('Player is already in the roster', 'error');
            } else {
                showAlert(error.data.detail, 'error');
            }
        } else {
            showAlert('Unable to add player - validation error', 'error');
        }
    } else {
        showAlert(`Failed to add ${memberTags.join(', ')}: ${error.message}`, 'error');
    }
}