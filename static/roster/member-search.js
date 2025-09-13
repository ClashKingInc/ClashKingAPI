/**
 * Member Search and Addition Functions
 */

// Search members for autocomplete
function searchMembers(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const suggestions = document.getElementById('member-suggestions');

        if (!query || query.length < 2) {
            suggestions.classList.add('hidden');
            return;
        }

        // Get list of already added member tags to exclude them
        const existingMemberTags = new Set();
        if (currentRosterData && currentRosterData.members) {
            currentRosterData.members.forEach(member => {
                existingMemberTags.add(member.tag.toLowerCase());
            });
        }

        const matches = clanMembers.filter(member => {
            // Exclude members already in the roster
            if (existingMemberTags.has(member.tag.toLowerCase())) {
                return false;
            }
            
            // Filter by query
            return member.name.toLowerCase().includes(query.toLowerCase()) ||
                   member.tag.toLowerCase().includes(query.toLowerCase());
        }).slice(0, 10); // Limit to 10 results

        if (matches.length === 0) {
            suggestions.classList.add('hidden');
            return;
        }

        suggestions.innerHTML = matches.map(member => `
            <div class="autocomplete-item flex items-center gap-3" onclick="selectMember('${member.tag}', '${member.name.replace("'", "\\'")}')">
                <div class="flex-1">
                    <div class="font-medium">${member.name}</div>
                    <div class="text-xs text-muted-foreground">${member.tag} • TH${member.townhall} • ${member.clan_name}</div>
                </div>
                <div class="px-2 py-1 bg-primary/10 text-primary rounded text-xs">TH${member.townhall}</div>
            </div>
        `).join('');

        suggestions.classList.remove('hidden');
    }, 300);
}

// Select member from autocomplete
function selectMember(tag, name) {
    document.getElementById('member-search').value = `${name} (${tag})`;
    document.getElementById('member-suggestions').classList.add('hidden');
    // Don't add immediately, just populate the search field
}

// Handle Enter key in search
function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addMemberDirectly();
    }
}

// Add member directly to roster
async function addMemberDirectly() {
    const input = document.getElementById('member-search');
    const categorySelect = document.getElementById('category-selector');
    let searchValue = input.value.trim();

    if (!searchValue) {
        showAlert('Please enter a player name or tag', 'error');
        return;
    }

    // Extract tag from input
    const tagMatch = searchValue.match(/^(.+?)\s*\((#[A-Z0-9]+)\)$/);
    let playerTag;

    if (tagMatch) {
        playerTag = tagMatch[2];
    } else {
        playerTag = searchValue.startsWith('#') ? searchValue : `#${searchValue.toUpperCase()}`;
    }

    const selectedCategory = categorySelect.value || null;

    try {
        const membersToAdd = [{
            tag: playerTag,
            signup_group: selectedCategory
        }];

        await apiCall(`${API_BASE}/roster/${currentRosterId}/members?server_id=${serverId}`, 'POST', {
            add: membersToAdd
        });

        showAlert(`Successfully added ${playerTag}!`);
        
        // Clear input and refresh display
        input.value = '';
        await loadMembersDisplay();
    } catch (error) {
        console.error('Error adding member:', error);
        handleMemberAddError(error, [playerTag]);
    }
}

// Toggle bulk add section
function toggleBulkAdd() {
    const section = document.getElementById('bulk-add-section');
    const chevron = document.getElementById('bulk-add-chevron');
    
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        section.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

// Validate and count bulk tags
function validateBulkTags() {
    const textarea = document.getElementById('bulk-tags-input');
    const countSpan = document.getElementById('bulk-tags-count');
    const addButton = document.getElementById('bulk-add-button');
    
    const text = textarea.value.trim();
    if (!text) {
        countSpan.textContent = '0 tags detected';
        addButton.disabled = true;
        return;
    }

    // Extract tags from text - support multiple formats
    const tags = extractTagsFromText(text);
    const validTags = tags.filter(tag => /^#[A-Z0-9]{3,}$/.test(tag));
    
    countSpan.textContent = `${validTags.length} valid tags detected`;
    if (tags.length > validTags.length) {
        countSpan.textContent += ` (${tags.length - validTags.length} invalid)`;
        countSpan.classList.add('text-yellow-600');
    } else {
        countSpan.classList.remove('text-yellow-600');
    }
    
    addButton.disabled = validTags.length === 0;
}

// Extract tags from text in various formats
function extractTagsFromText(text) {
    const tags = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Match various formats: #TAG, player name (#TAG), just TAG
        const matches = trimmedLine.match(/#?[A-Z0-9]{3,}/gi);
        if (matches) {
            for (let match of matches) {
                // Ensure tag starts with #
                if (!match.startsWith('#')) {
                    match = '#' + match;
                }
                // Normalize to uppercase
                tags.push(match.toUpperCase());
            }
        }
    }
    
    // Remove duplicates
    return [...new Set(tags)];
}

// Add multiple members at once
async function addBulkMembers() {
    const textarea = document.getElementById('bulk-tags-input');
    const categorySelect = document.getElementById('bulk-category-selector');
    const text = textarea.value.trim();

    if (!text) {
        showAlert('Please enter player tags', 'error');
        return;
    }

    const tags = extractTagsFromText(text);
    const validTags = tags.filter(tag => /^#[A-Z0-9]{3,}$/.test(tag));
    
    if (validTags.length === 0) {
        showAlert('No valid tags found', 'error');
        return;
    }

    const selectedCategory = categorySelect.value || null;
    const membersToAdd = validTags.map(tag => ({
        tag: tag,
        signup_group: selectedCategory
    }));

    try {
        await apiCall(`${API_BASE}/roster/${currentRosterId}/members?server_id=${serverId}`, 'POST', {
            add: membersToAdd
        });

        showAlert(`Successfully added ${validTags.length} members!`);
        
        // Clear textarea and refresh display
        textarea.value = '';
        validateBulkTags(); // Reset counter
        await loadMembersDisplay();
        
        // Optionally hide bulk add section
        toggleBulkAdd();
    } catch (error) {
        console.error('Error adding bulk members:', error);
        handleMemberAddError(error, validTags);
    }
}

// Populate category dropdown for member addition
function populateCategoryDropdown() {
    const categorySelect = document.getElementById('category-selector');
    const bulkCategorySelect = document.getElementById('bulk-category-selector');
    
    if (!categorySelect && !bulkCategorySelect) return;
    
    // Check if categories need updating
    const currentOptionCount = categorySelect ? categorySelect.children.length : 0;
    const expectedOptionCount = categories ? categories.length + 1 : 1; // +1 for "No category"
    const needsPopulating = categories && categories.length > 0 && currentOptionCount !== expectedOptionCount;

    if (!needsPopulating && currentOptionCount > 1) return; // Already populated correctly

    const categoryOptions = ['<option value="">No category</option>'];
    if (categories) {
        categories.forEach(category => {
            categoryOptions.push(`<option value="${category.custom_id}">${category.alias}</option>`);
        });
    }

    if (categorySelect) categorySelect.innerHTML = categoryOptions.join('');
    if (bulkCategorySelect) bulkCategorySelect.innerHTML = categoryOptions.join('');
}

// Remove member from roster
async function removeMember(memberTag) {
    if (!confirm(`Are you sure you want to remove ${memberTag}?`)) {
        return;
    }

    try {
        await apiCall(`${API_BASE}/roster/${currentRosterId}/members?server_id=${serverId}`, 'POST', {
            remove: [memberTag]
        });

        showAlert(`Successfully removed ${memberTag}!`);
        await loadMembersDisplay();
    } catch (error) {
        console.error('Error removing member:', error);
        showAlert(`Failed to remove ${memberTag}: ${error.message}`, 'error');
    }
}