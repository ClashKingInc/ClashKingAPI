/**
 * Settings Management Functions
 */

// Save roster settings
async function saveRosterSettings(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Build update data
    const updateData = {};
    
    // Basic fields
    if (formData.get('alias')) updateData.alias = formData.get('alias');
    if (formData.get('roster_size')) updateData.roster_size = parseInt(formData.get('roster_size'));
    if (formData.get('description') !== null) updateData.description = formData.get('description') || null;
    
    // Organization fields
    if (formData.get('roster_type')) updateData.roster_type = formData.get('roster_type');
    if (formData.get('signup_scope')) updateData.signup_scope = formData.get('signup_scope');
    if (formData.get('clan_tag') !== null) updateData.clan_tag = formData.get('clan_tag') || null;
    
    // Requirements
    if (formData.get('min_th')) updateData.min_th = parseInt(formData.get('min_th'));
    else if (formData.get('min_th') === '') updateData.min_th = null;
    
    if (formData.get('max_th')) updateData.max_th = parseInt(formData.get('max_th'));
    else if (formData.get('max_th') === '') updateData.max_th = null;
    
    if (formData.get('max_accounts_per_user')) updateData.max_accounts_per_user = parseInt(formData.get('max_accounts_per_user'));
    else if (formData.get('max_accounts_per_user') === '') updateData.max_accounts_per_user = null;
    
    // Handle allowed categories checkboxes
    const allowedCategories = formData.getAll('allowed_signup_categories');
    updateData.allowed_signup_categories = allowedCategories.length > 0 ? allowedCategories : null;
    
    try {
        const response = await apiCall(`${API_BASE}/roster/${currentRosterId}?server_id=${serverId}`, 'PATCH', updateData);
        
        // Update local roster data
        currentRosterData = response.roster;
        
        showAlert('Settings saved successfully!');
        
        // Update UI elements that depend on roster data
        updateRosterUI(currentRosterData);
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showAlert('Failed to save settings: ' + error.message, 'error');
    }
}

// Update form with roster data
function updateSettingsForm(roster) {
    if (!roster) return;
    
    const form = document.getElementById('roster-form');
    if (!form) return;
    
    try {
        // Basic information
        if (roster.alias) form.elements['alias'].value = roster.alias;
        if (roster.roster_size) form.elements['roster_size'].value = roster.roster_size;
        if (roster.description) form.elements['description'].value = roster.description;
        
        // Organization
        if (roster.roster_type) form.elements['roster_type'].value = roster.roster_type;
        if (roster.signup_scope) form.elements['signup_scope'].value = roster.signup_scope;
        if (roster.clan_tag) form.elements['clan_tag'].value = roster.clan_tag;
        
        // Requirements
        if (roster.min_th) form.elements['min_th'].value = roster.min_th;
        if (roster.max_th) form.elements['max_th'].value = roster.max_th;
        if (roster.max_accounts_per_user) form.elements['max_accounts_per_user'].value = roster.max_accounts_per_user;
        
        // Categories checkboxes
        const categoryCheckboxes = form.querySelectorAll('input[name="allowed_signup_categories"]');
        categoryCheckboxes.forEach(checkbox => {
            checkbox.checked = roster.allowed_signup_categories && 
                               roster.allowed_signup_categories.includes(checkbox.value);
        });
        
        // Update display columns dropdowns
        const displayColumns = roster.columns || ['townhall', 'name', 'tag', 'hitrate'];
        
        // Set column configuration
        for (let i = 1; i <= 4; i++) {
            const element = document.getElementById(`column-${i}`);
            if (element) {
                element.value = displayColumns[i - 1] || '';
            }
        }
        
        // Update sort configuration  
        const sortConfig = roster.sort || ['townhall', 'name'];
        
        // Set sort configuration
        for (let i = 1; i <= 4; i++) {
            const element = document.getElementById(`sort-${i}`);
            if (element) {
                element.value = sortConfig[i - 1] || '';
            }
        }
        
    } catch (error) {
        console.error('Error updating settings form:', error);
    }
}