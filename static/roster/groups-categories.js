/**
 * Groups and Categories Management Functions
 */

// Modal management
function showCreateGroupModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('create-group-modal').classList.remove('hidden');
}

function showCreateCategoryModal() {
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('create-category-modal').classList.remove('hidden');
}

function closeModals() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('create-group-modal').classList.add('hidden');
    document.getElementById('create-category-modal').classList.add('hidden');
}

// Create new group
async function createGroup(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = {
        alias: formData.get('alias'),
        server_id: serverId
    };
    
    try {
        await apiCall(`${API_BASE}/roster-group`, 'POST', data);
        showAlert('Group created successfully!');
        closeModals();
        
        // Refresh the page to show the new group
        window.location.reload();
    } catch (error) {
        console.error('Error creating group:', error);
        showAlert('Failed to create group: ' + error.message, 'error');
    }
}

// Create new category
async function createCategory(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = {
        alias: formData.get('alias'),
        server_id: serverId
    };
    
    try {
        await apiCall(`${API_BASE}/roster-signup-category`, 'POST', data);
        showAlert('Category created successfully!');
        closeModals();
        
        // Refresh the page to show the new category
        window.location.reload();
    } catch (error) {
        console.error('Error creating category:', error);
        showAlert('Failed to create category: ' + error.message, 'error');
    }
}

// Delete group
async function deleteGroup(groupId) {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`${API_BASE}/roster-group/${groupId}?server_id=${serverId}`, 'DELETE');
        showAlert('Group deleted successfully!');
        
        // Refresh the page to reflect changes
        window.location.reload();
    } catch (error) {
        console.error('Error deleting group:', error);
        showAlert('Failed to delete group: ' + error.message, 'error');
    }
}

// Delete category
async function deleteCategory(customId) {
    if (!confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
        return;
    }
    
    try {
        await apiCall(`${API_BASE}/roster-signup-category/${customId}?server_id=${serverId}`, 'DELETE');
        showAlert('Category deleted successfully!');
        
        // Refresh the page to reflect changes
        window.location.reload();
    } catch (error) {
        console.error('Error deleting category:', error);
        showAlert('Failed to delete category: ' + error.message, 'error');
    }
}

// Close modals on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModals();
    }
});