/**
 * Member Display and Management Functions
 */

// Load and display members
async function loadMembersDisplay() {
    if (!currentRosterId) return;

    try {
        const response = await apiCall(`${API_BASE}/roster/${currentRosterId}?server_id=${serverId}`, 'GET');
        const roster = response.roster;
        
        
        // Update currentRosterData so search suggestions are updated
        currentRosterData = roster;

        if (!roster.members || roster.members.length === 0) {
            const emptyState = document.getElementById('members-empty-state');
            const memberCategories = document.getElementById('member-categories');
            if (emptyState) emptyState.style.display = 'block';
            if (memberCategories) memberCategories.style.display = 'none';
            return;
        }

        const emptyState = document.getElementById('members-empty-state');
        const memberCategories = document.getElementById('member-categories');
        if (emptyState) emptyState.style.display = 'none';
        if (memberCategories) memberCategories.style.display = 'block';

        // Sort members based on configuration (most fields descending, dates ascending)
        const sortConfig = getCurrentSortConfig();
        const sortedMembers = [...roster.members].sort((a, b) => {
            for (const field of sortConfig) {
                if (!field) continue;
                
                let valueA = a[field];
                let valueB = b[field];
                
                // Handle null/undefined values
                if (valueA == null && valueB == null) continue;
                if (valueA == null) return 1; // null values go to end
                if (valueB == null) return -1;
                
                // Special handling for date fields - ascending order (oldest first)
                const isDateField = field === 'added_at' || field.includes('date') || field.includes('time');
                
                // Handle different data types
                if (typeof valueA === 'string' && typeof valueB === 'string') {
                    const comparison = isDateField ? 
                        valueA.toLowerCase().localeCompare(valueB.toLowerCase()) : // Ascending for dates
                        valueB.toLowerCase().localeCompare(valueA.toLowerCase()); // Descending for text
                    if (comparison !== 0) return comparison;
                } else if (typeof valueA === 'number' && typeof valueB === 'number') {
                    if (valueA !== valueB) {
                        return isDateField ? 
                            valueA - valueB : // Ascending for dates (timestamps)
                            valueB - valueA;  // Descending for numbers
                    }
                } else {
                    // Convert to string for comparison
                    const strA = String(valueA).toLowerCase();
                    const strB = String(valueB).toLowerCase();
                    const comparison = isDateField ? 
                        strA.localeCompare(strB) : // Ascending for dates
                        strB.localeCompare(strA);  // Descending for others
                    if (comparison !== 0) return comparison;
                }
            }
            return 0;
        });

        // Group members by category
        const membersByCategory = {};
        const uncategorizedMembers = [];
        
        sortedMembers.forEach(member => {
            if (!member.signup_group) {
                uncategorizedMembers.push(member);
            } else {
                if (!membersByCategory[member.signup_group]) {
                    membersByCategory[member.signup_group] = [];
                }
                membersByCategory[member.signup_group].push(member);
            }
        });

        // Create table display
        let html = '';
        
        // Add table header
        const displayColumns = getCurrentDisplayColumns();
        html += createTableHeader(displayColumns);
        html += '<tbody id="members-table-body">';

        // Add uncategorized members first
        if (uncategorizedMembers.length > 0) {
            html += createGroupSeparator('Uncategorized', uncategorizedMembers.length);
            html += createEmptyDropRow(''); // For uncategorized
            uncategorizedMembers.forEach(member => {
                html += createMemberCard(member, displayColumns);
            });
        }

        // Add categorized members
        categories.forEach(category => {
            const categoryMembers = membersByCategory[category.custom_id] || [];
            html += createGroupSeparator(category.alias, categoryMembers.length);
            html += createEmptyDropRow(category.custom_id);
            categoryMembers.forEach(member => {
                html += createMemberCard(member, displayColumns);
            });
        });

        html += createTableFooter();

        // Update display
        const memberCategoriesContainer = document.getElementById('member-categories');
        
        // Create roster info display
        const rosterInfoHTML = createRosterInfoDisplay(roster);
        
        memberCategoriesContainer.innerHTML = `
            <div class="w-full space-y-4">
                ${rosterInfoHTML}
                <div class="bg-card border border-border rounded-lg w-full">
                    <div class="overflow-x-auto">
                        ${html}
                    </div>
                </div>
            </div>
        `;

        // Initialize Lucide icons for new content
        lucide.createIcons();

    } catch (error) {
        console.error('Error loading members:', error);
        showAlert('Failed to load members: ' + error.message, 'error');
    }
}

// Create table header
function createTableHeader(displayColumns) {
    const headers = displayColumns.map(col => {
        const columnName = getColumnDisplayName(col);
        return `<th class="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">${columnName}</th>`;
    }).join('');
    
    return `
        <table class="member-table" id="members-table">
            <thead class="bg-muted/50">
                <tr>
                    ${headers}
                    <th class="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
    `;
}

// Create table footer
function createTableFooter() {
    return `
            </tbody>
        </table>
    `;
}

// Create member row
function createMemberCard(member, displayColumns) {
    const isInFamily = member.is_in_family !== false; // Default to true if not specified
    
    const columnData = [];
    displayColumns.forEach(col => {
        let cellContent = '<td class="px-3 py-2 text-xs text-muted-foreground text-center">-</td>';
        
        switch(col) {
            case 'townhall':
                if (member.townhall !== undefined && member.townhall !== null) {
                    cellContent = `<td class="px-3 py-2 text-xs text-orange-400 font-medium text-center">TH${member.townhall}</td>`;
                }
                break;
            case 'name':
                if (member.name) {
                    const nameWithSub = member.sub ? `${member.name} <span class="text-xs text-yellow-600">(Sub)</span>` : member.name;
                    cellContent = `<td class="px-3 py-2 text-xs text-white font-medium text-center">${nameWithSub}</td>`;
                }
                break;
            case 'tag':
                if (member.tag) {
                    cellContent = `<td class="px-3 py-2 text-xs text-muted-foreground font-mono text-center">${member.tag}</td>`;
                }
                break;
            case 'hitrate':
                if (member.hitrate !== undefined && member.hitrate !== null) {
                    const hitColor = member.hitrate >= 80 ? 'text-green-400' : member.hitrate >= 60 ? 'text-yellow-400' : 'text-red-400';
                    cellContent = `<td class="px-3 py-2 text-xs ${hitColor} font-medium text-center">${member.hitrate}%</td>`;
                }
                break;
            case 'current_clan_tag':
                if (member.current_clan_tag && member.current_clan_tag !== '#') {
                    // Determine clan tag color based on relationship
                    let colorClass = 'text-red-400'; // Default: external clan
                    
                    // Check if it's the roster's main clan
                    if (currentRosterData && member.current_clan_tag === currentRosterData.clan_tag) {
                        colorClass = 'text-green-400'; // Main clan: green
                    }
                    // Check if it's a family clan
                    else if (serverClans && serverClans.some(clan => clan.tag === member.current_clan_tag)) {
                        colorClass = 'text-yellow-400'; // Family clan: yellow
                    }
                    
                    cellContent = `<td class="px-3 py-2 text-xs ${colorClass} font-mono text-center">${member.current_clan_tag}</td>`;
                }
                break;
            case 'discord':
                if (member.discord && member.discord !== 'No User') {
                    cellContent = `<td class="px-3 py-2 text-xs text-blue-400 text-center">@${member.discord.replace(/[<>@!]/g, '')}</td>`;
                }
                break;
            case 'hero_lvs':
                if (member.hero_lvs !== undefined && member.hero_lvs !== null) {
                    cellContent = `<td class="px-3 py-2 text-xs text-purple-400 text-center">${member.hero_lvs}</td>`;
                }
                break;
            case 'war_pref':
                const warStatus = member.war_pref ? '⚔️ In' : '🚫 Out';
                const warColor = member.war_pref ? 'text-green-400' : 'text-red-400';
                cellContent = `<td class="px-3 py-2 text-xs ${warColor} text-center">${warStatus}</td>`;
                break;
            case 'trophies':
                if (member.trophies !== undefined && member.trophies !== null) {
                    cellContent = `<td class="px-3 py-2 text-xs text-yellow-400 text-center">${member.trophies} 🏆</td>`;
                }
                break;
            default:
                cellContent = `<td class="px-3 py-2 text-xs text-muted-foreground text-center">-</td>`;
                break;
        }
        columnData.push(cellContent);
    });
    
    return `
        <tr class="member-row hover:bg-accent/50 transition-colors border-b border-border" 
            draggable="true" data-member-tag="${member.tag}" 
            ondragstart="dragStart(event)" ondragend="dragEnd(event)">
            ${columnData.join('')}
            <td class="px-3 py-2 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="removeMember('${member.tag}')" 
                            class="w-5 h-5 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                        <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Create group separator row
function createGroupSeparator(categoryName, categoryCount) {
    const displayColumns = getCurrentDisplayColumns();
    const totalCols = displayColumns.length + 1; // +1 for actions column
    
    return `
        <tr class="group-separator">
            <td colspan="${totalCols}" class="px-3 py-3 bg-muted/30 border-y border-border">
                <div class="flex items-center justify-between">
                    <div class="w-16"></div>
                    <h4 class="font-medium text-sm text-center flex-1">${categoryName}</h4>
                    <span class="text-xs text-muted-foreground">${categoryCount} member${categoryCount !== 1 ? 's' : ''}</span>
                </div>
            </td>
        </tr>
    `;
}

// Create empty drop row for drag & drop
function createEmptyDropRow(categoryId) {
    const displayColumns = getCurrentDisplayColumns();
    const totalCols = displayColumns.length + 1;
    
    return `
        <tr class="empty-drop-row hidden drop-zone" 
            ondrop="handleDrop(event, '${categoryId}')" 
            ondragover="event.preventDefault()" 
            ondragenter="handleDragEnter(event)" 
            ondragleave="handleDragLeave(event)">
            <td colspan="${totalCols}" class="px-3 py-4 text-center text-muted-foreground border-2 border-dashed border-transparent">
                <div class="flex items-center justify-center gap-2">
                    <i data-lucide="move" class="w-4 h-4"></i>
                    Drop member here to move to ${categoryId ? categories.find(c => c.custom_id === categoryId)?.alias || 'category' : 'uncategorized'}
                </div>
            </td>
        </tr>
    `;
}

// Get column display name
function getColumnDisplayName(col) {
    const columnNames = {
        'townhall': 'TH',
        'name': 'Name',
        'tag': 'Tag',
        'hitrate': 'Hit Rate',
        'current_clan_tag': 'Clan',
        'discord': 'Discord',
        'hero_lvs': 'Heroes',
        'war_pref': 'War Status',
        'trophies': 'Trophies'
    };
    return columnNames[col] || col;
}

// Display configuration functions
function toggleDisplayConfig() {
    const content = document.getElementById('display-config-content');
    const chevron = document.getElementById('display-config-chevron');
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
        // Load current configuration when opening
        loadDisplayConfiguration();
    } else {
        content.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

function loadDisplayConfiguration() {
    const displayColumns = getCurrentDisplayColumns();
    const sortConfig = getCurrentSortConfig();
    
    // Set column configuration
    for (let i = 0; i < 4; i++) {
        const select = document.getElementById(`column-${i + 1}`);
        if (select) {
            select.value = displayColumns[i] || '';
        }
    }
    
    // Set sort configuration
    for (let i = 0; i < 4; i++) {
        const select = document.getElementById(`sort-${i + 1}`);
        if (select) {
            select.value = sortConfig[i] || '';
        }
    }
}

function saveDisplayConfiguration() {
    // Get column configuration
    const selectedColumns = [];
    for (let i = 1; i <= 4; i++) {
        const select = document.getElementById(`column-${i}`);
        if (select && select.value) {
            selectedColumns.push(select.value);
        }
    }
    
    // Get sort configuration
    const sortConfig = [];
    for (let i = 1; i <= 4; i++) {
        const select = document.getElementById(`sort-${i}`);
        if (select && select.value) {
            sortConfig.push(select.value);
        }
    }
    
    // Map to API field names
    const columnMapping = {
        'townhall': 'townhall',
        'name': 'name', 
        'tag': 'tag',
        'hitrate': 'hitrate',
        'current_clan_tag': 'current_clan_tag',
        'discord': 'discord',
        'hero_lvs': 'hero_lvs',
        'war_pref': 'war_pref',
        'trophies': 'trophies'
    };
    
    const apiColumns = selectedColumns.map(col => columnMapping[col] || col);
    const apiSort = sortConfig.map(field => columnMapping[field] || field);
    
    // Update local data immediately for responsive UI
    if (currentRosterData) {
        currentRosterData.columns = apiColumns;
        currentRosterData.sort = apiSort;
    }
    
    // Save to server
    saveRosterDisplaySettings(apiColumns, apiSort);
    
    // Refresh display
    loadMembersDisplay();
    
    // Close configuration panel
    toggleDisplayConfig();
    
    showAlert('Display configuration saved!');
}

async function saveRosterDisplaySettings(columns, sort) {
    try {
        const updateData = {
            columns: columns,
            sort: sort
        };
        
        await apiCall(`${API_BASE}/roster/${currentRosterId}?server_id=${serverId}`, 'PATCH', updateData);
    } catch (error) {
        console.error('Error saving display settings:', error);
        showAlert('Failed to save display settings: ' + error.message, 'error');
    }
}

function getCurrentDisplayColumns() {
    if (!currentRosterData || !currentRosterData.columns) {
        return ['townhall', 'name', 'tag', 'hitrate']; // Default columns
    }
    
    // Map API fields back to display fields
    const reverseColumnMapping = {
        'Name': 'name',
        'Townhall Level': 'townhall',
        'Tag': 'tag', 
        '30 Day Hitrate': 'hitrate',
        'Clan Tag': 'current_clan_tag',
        'Discord': 'discord',
        'Heroes': 'hero_lvs',
        'War Opt': 'war_pref',
        'Trophies': 'trophies'
    };
    
    return currentRosterData.columns.map(col => reverseColumnMapping[col] || col);
}

function getCurrentSortConfig() {
    if (!currentRosterData || !currentRosterData.sort) {
        return ['townhall', 'name']; // Default sort
    }
    
    // Map API fields back to display fields  
    const reverseSortMapping = {
        'Townhall Level': 'townhall',
        'Name': 'name',
        'Tag': 'tag',
        'Heroes': 'hero_lvs', 
        'Trophies': 'trophies',
        '30 Day Hitrate': 'hitrate',
        'Clan Tag': 'current_clan_tag',
        'Added At': 'added_at'
    };
    
    return currentRosterData.sort.map(field => reverseSortMapping[field] || field);
}

// Refresh members
async function refreshMembers() {
    await loadMembersDisplay();
    showAlert('Members refreshed!');
}

// Clear bulk tags
function clearBulkTags() {
    const textarea = document.getElementById('bulk-tags-input');
    if (textarea) {
        textarea.value = '';
        validateBulkTags();
    }
}