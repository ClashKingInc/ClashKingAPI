/**
 * Main Dashboard Functions
 */

// Initialize dashboard
function initializeDashboard() {
    console.log('Initializing roster dashboard...');
    
    // Load clan members for search
    loadClanMembers();
    
    // Populate category dropdowns
    populateCategoryDropdown();
    
    // Show appropriate content based on current roster
    if (currentRosterId) {
        showRosterUI();
        // Load members if we're starting on the members tab
        const savedTab = localStorage.getItem('roster-current-tab') || 'settings';
        if (savedTab === 'members') {
            loadMembersDisplay();
        }
    } else {
        document.getElementById('welcome-content').style.display = 'block';
        document.getElementById('roster-tabs').style.display = 'none';
    }
    
    // Hide autocomplete on click outside
    document.addEventListener('click', function(event) {
        const searchContainer = document.getElementById('member-search')?.parentElement;
        const suggestions = document.getElementById('member-suggestions');
        
        if (suggestions && searchContainer && !searchContainer.contains(event.target)) {
            suggestions.classList.add('hidden');
        }
    });
    
    console.log('Dashboard initialized successfully');
}

// Tab navigation
function showTab(tabName) {
    // Update sidebar tabs (both main and sidebar versions)
    document.querySelectorAll('[id^="tab-"], [id^="sidebar-tab-"]').forEach(tab => {
        tab.classList.remove('tab-active');
        tab.classList.add('tab-inactive');
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Show selected tab - try both main and sidebar versions
    const mainTab = document.getElementById('tab-' + tabName);
    const sidebarTab = document.getElementById('sidebar-tab-' + tabName);
    const content = document.getElementById('content-' + tabName);
    
    if (mainTab) {
        mainTab.classList.remove('tab-inactive');
        mainTab.classList.add('tab-active');
    }
    if (sidebarTab) {
        sidebarTab.classList.remove('tab-inactive');
        sidebarTab.classList.add('tab-active');
    }
    if (content) {
        content.classList.remove('hidden');
    }
    
    // Save current tab to localStorage
    localStorage.setItem('roster-current-tab', tabName);
    
    // If switching to members tab, reload the form data to populate dropdowns and load members
    if (tabName === 'members' && currentRosterData) {
        console.log('Switching to members tab, reloading form data...');
        setTimeout(() => {
            updateSettingsForm(currentRosterData);
            populateCategoryDropdown(); // Ensure category dropdown is populated
            loadMembersDisplay(); // Load members display for drag & drop interface
        }, 100);
    }
}

// Roster selection
async function selectRoster() {
    const selectedId = document.getElementById('roster-selector').value;

    if (!selectedId) {
        // Update URL to remove roster_id
        const url = new URL(window.location);
        url.searchParams.delete('roster_id');
        window.history.pushState({}, '', url);

        document.getElementById('roster-tabs').style.display = 'none';
        document.getElementById('welcome-content').style.display = 'block';
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        currentRosterId = '';
        return;
    }

    // If it's the same roster, just show the UI
    if (selectedId === currentRosterId) {
        showRosterUI();
        return;
    }

    // Update URL with new roster_id
    const url = new URL(window.location);
    url.searchParams.set('roster_id', selectedId);
    window.history.pushState({}, '', url);

    // Load new roster data
    try {
        const response = await apiCall(`${API_BASE}/roster/${selectedId}?server_id=${serverId}`, 'GET');
        const roster = response.roster;

        // Update current roster ID and data
        currentRosterId = selectedId;
        currentRosterData = roster;

        // Update UI with new roster data
        updateRosterUI(roster);
        showRosterUI();
    } catch (error) {
        showAlert('Failed to load roster data', 'error');
        // Reset selector to previous value
        document.getElementById('roster-selector').value = currentRosterId;
        // Revert URL
        const url = new URL(window.location);
        if (currentRosterId) url.searchParams.set('roster_id', currentRosterId);
        else url.searchParams.delete('roster_id');
        window.history.pushState({}, '', url);
    }
}

function showRosterUI() {
    document.getElementById('roster-tabs').style.display = 'block';
    document.getElementById('welcome-content').style.display = 'none';

    // Show last active tab or default to settings
    const savedTab = localStorage.getItem('roster-current-tab') || 'settings';
    showTab(savedTab);
}

function updateRosterUI(roster) {
    try {
        // Update form fields in settings
        updateSettingsForm(roster);

        // Update member count in sidebar
        const sidebarCount = document.getElementById('sidebar-member-count');
        if (sidebarCount) {
            sidebarCount.textContent = roster.members?.length || 0;
        }

        // Load members display for drag & drop interface
        loadMembersDisplay();
    } catch (error) {
        console.error('Error updating roster UI:', error);
    }
}

// Comparison mode variables
let comparisonMode = false;
let comparisonRosters = [];

// Toggle comparison mode
function toggleComparisonMode() {
    comparisonMode = !comparisonMode;
    
    if (comparisonMode) {
        showComparisonInterface();
    } else {
        hideComparisonInterface();
    }
}

// Show comparison interface
function showComparisonInterface() {
    // Create comparison panel
    const comparisonPanel = document.createElement('div');
    comparisonPanel.id = 'comparison-panel';
    comparisonPanel.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center';
    
    comparisonPanel.innerHTML = `
        <div class="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                <i data-lucide="columns" class="w-5 h-5"></i>
                Select Rosters to Compare
            </h3>
            
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Additional Roster 1</label>
                    <select id="comparison-roster-1" class="w-full px-3 py-2 bg-background border border-input rounded-md text-sm">
                        <option value="">Select a roster...</option>
                        ${allRosters.filter(r => r.custom_id !== currentRosterId).map(roster => 
                            `<option value="${roster.custom_id}">${roster.alias}</option>`
                        ).join('')}
                    </select>
                </div>
                
                <div>
                    <label class="block text-sm font-medium mb-2">Second Roster</label>
                    <select id="comparison-roster-2" class="w-full px-3 py-2 bg-background border border-input rounded-md text-sm">
                        <option value="">Select a roster...</option>
                        ${allRosters.filter(r => r.custom_id !== currentRosterId).map(roster => 
                            `<option value="${roster.custom_id}">${roster.alias}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            
            <div class="flex gap-3 mt-6">
                <button onclick="cancelComparison()" 
                        class="flex-1 px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-secondary/80 transition-colors">
                    Cancel
                </button>
                <button onclick="startComparison()" 
                        class="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors">
                    Compare
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(comparisonPanel);
    
    // Initialize Lucide icons for the new content
    lucide.createIcons();
}

// Cancel comparison
function cancelComparison() {
    comparisonMode = false;
    window.comparisonMode = false;
    window.comparisonRosters = [];
    hideComparisonInterface();
}

// Start comparison
async function startComparison() {
    const roster1Id = document.getElementById('comparison-roster-1').value;
    const roster2Id = document.getElementById('comparison-roster-2').value;
    
    if (!roster1Id) {
        showAlert('Please select at least one roster for comparison', 'error');
        return;
    }
    
    // Close selection modal
    const panel = document.getElementById('comparison-panel');
    if (panel) panel.remove();
    
    // Load comparison rosters
    try {
        comparisonRosters = [];
        
        // Load first comparison roster
        const response1 = await apiCall(`${API_BASE}/roster/${roster1Id}?server_id=${serverId}`, 'GET');
        comparisonRosters.push(response1.roster);
        
        // Load second comparison roster if provided
        if (roster2Id) {
            const response2 = await apiCall(`${API_BASE}/roster/${roster2Id}?server_id=${serverId}`, 'GET');
            comparisonRosters.push(response2.roster);
        }
        
        // Switch to comparison layout
        showComparisonLayout();
        
    } catch (error) {
        showAlert('Failed to load comparison rosters: ' + error.message, 'error');
        cancelComparison();
    }
}

// Hide comparison interface
function hideComparisonInterface() {
    const panel = document.getElementById('comparison-panel');
    if (panel) panel.remove();
    
    // Reset to single roster layout
    showSingleRosterLayout();
}

// Show comparison layout (side by side with same structure as Members tab)
function showComparisonLayout() {
    const mainContent = document.querySelector('.flex-1.overflow-auto');
    if (!mainContent) return;
    
    // Set comparison mode flag
    comparisonMode = true;
    window.comparisonMode = true;
    window.comparisonRosters = comparisonRosters;
    
    // Determine number of columns based on available rosters
    const numColumns = 1 + comparisonRosters.length; // 1 for main roster + comparison rosters
    const gridCols = numColumns === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-3';
    
    // Create dynamic layout with header
    mainContent.innerHTML = `
        <div class="h-full flex flex-col">
            <!-- Header with controls -->
            <div class="bg-card border-b border-border p-4 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <h2 class="text-lg font-semibold">Roster Comparison</h2>
                    <div class="text-sm text-muted-foreground">
                        ${currentRosterData.alias} vs ${comparisonRosters.map(r => r.alias).join(' vs ')}
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <button onclick="showRosterSelector()" class="px-3 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 transition-colors">
                        <i data-lucide="settings" class="w-3 h-3 inline mr-1"></i>
                        Change Rosters
                    </button>
                    <button onclick="cancelComparison()" class="px-3 py-1 text-xs border border-border rounded-md hover:bg-accent transition-colors">
                        <i data-lucide="x" class="w-3 h-3 inline mr-1"></i>
                        Exit
                    </button>
                </div>
            </div>
            
            <!-- Rosters grid -->
            <div class="flex-1 overflow-auto">
                <div class="grid ${gridCols} gap-6 p-6 h-full">
                    <!-- Main roster column -->
                    <div class="space-y-6">
                        <!-- Roster info -->
                        ${createRosterInfoDisplay(currentRosterData)}
                        
                        <!-- Members table -->
                        <div class="bg-card border border-border rounded-lg">
                            <div class="p-4 border-b border-border">
                                <h3 class="font-semibold">${currentRosterData.alias} <span class="text-xs text-primary">(Current)</span></h3>
                            </div>
                            <div id="main-roster-content" class="overflow-x-auto" data-roster-id="${currentRosterId}">
                                <!-- Members table will be loaded here -->
                            </div>
                        </div>
                    </div>
                    
                    ${comparisonRosters.map((roster, index) => {
                        console.log(`DEBUG: Creating comparison roster ${index + 1} with ID: ${roster.id}, custom_id: ${roster.custom_id}`);
                        return `
                    <!-- Comparison roster ${index + 1} -->
                    <div class="space-y-6">
                        <!-- Roster info -->
                        ${createRosterInfoDisplay(roster)}
                        
                        <!-- Members table -->
                        <div class="bg-card border border-border rounded-lg">
                            <div class="p-4 border-b border-border">
                                <h3 class="font-semibold">${roster.alias}</h3>
                            </div>
                            <div id="comparison-roster-${index + 1}-content" class="overflow-x-auto" data-roster-id="${roster.id || roster.custom_id}">
                                <!-- Members table will be loaded here -->
                            </div>
                        </div>
                    </div>
                    `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Load members for all rosters using the same structure as Members tab
    loadComparisonMembersWithTables();
    
    // Initialize Lucide icons
    lucide.createIcons();
    
    // Debug: Check draggable elements and test drop zones
    setTimeout(() => {
        const draggableElements = document.querySelectorAll('[draggable="true"]');
        console.log('DEBUG: Found', draggableElements.length, 'draggable elements in comparison view');
        draggableElements.forEach((el, index) => {
            console.log(`DEBUG: Element ${index}:`, el.dataset.memberTag, 'from roster:', el.dataset.sourceRoster);
        });
        
        // Debug drag and drop setup
        const categoryDropZones = document.querySelectorAll('.category-drop-zone');
        console.log('DEBUG: Found', categoryDropZones.length, 'category drop zones');
        categoryDropZones.forEach((zone, index) => {
            console.log(`DEBUG: Category zone ${index}:`, zone.dataset.categoryId, zone.title);
        });
        console.log('DEBUG: Comparison view ready for drag and drop');
    }, 100);
}

// Show single roster layout
function showSingleRosterLayout() {
    // Reset to original layout and reload
    location.reload(); // Simple approach to reset everything
}

// Get all duplicate member tags across all rosters in comparison
function getDuplicateMembers() {
    const allRosters = [currentRosterData, ...comparisonRosters];
    const memberCounts = {};
    const duplicates = new Set();
    
    // Count occurrences of each member tag across all rosters
    allRosters.forEach(roster => {
        if (roster && roster.members) {
            roster.members.forEach(member => {
                const tag = member.tag;
                memberCounts[tag] = (memberCounts[tag] || 0) + 1;
                if (memberCounts[tag] > 1) {
                    duplicates.add(tag);
                }
            });
        }
    });
    
    return duplicates;
}

// Reload comparison data from API and refresh display
async function reloadComparisonData() {
    try {
        console.log('DEBUG: Reloading roster data from API...');
        
        // Reload main roster data
        const mainRosterResponse = await apiCall(`${API_BASE}/roster/${currentRosterId}?server_id=${serverId}`, 'GET');
        currentRosterData = mainRosterResponse.roster;
        
        // Reload comparison rosters data
        for (let i = 0; i < comparisonRosters.length; i++) {
            const rosterId = comparisonRosters[i].id || comparisonRosters[i].custom_id;
            const response = await apiCall(`${API_BASE}/roster/${rosterId}?server_id=${serverId}`, 'GET');
            comparisonRosters[i] = response.roster;
        }
        
        // Update global reference
        window.comparisonRosters = comparisonRosters;
        
        // Refresh display
        console.log('DEBUG: Refreshing comparison display with updated data...');
        loadComparisonMembersWithTables();
        
        console.log('DEBUG: Roster data reloaded successfully');
        console.log('DEBUG: Main roster member count:', currentRosterData.members?.length || 0);
        console.log('DEBUG: Comparison rosters member counts:', comparisonRosters.map(r => ({id: r.id || r.custom_id, count: r.members?.length || 0})));
    } catch (error) {
        console.error('Error reloading comparison data:', error);
        showAlert('Failed to refresh display: ' + error.message, 'error');
    }
}

// Load members for comparison view with full table structure
function loadComparisonMembersWithTables() {
    // Get duplicate members first
    const duplicateMembers = getDuplicateMembers();
    console.log('DEBUG: Found duplicate members:', [...duplicateMembers]);
    
    // Load main roster
    console.log('DEBUG: Loading main roster with ID:', currentRosterData?.id || currentRosterId);
    loadMembersTableInContainer('main-roster-content', currentRosterData, true, duplicateMembers);
    
    // Load comparison rosters dynamically
    comparisonRosters.forEach((roster, index) => {
        loadMembersTableInContainer(`comparison-roster-${index + 1}-content`, roster, false, duplicateMembers);
    });
}

// Load members in a specific container
function loadMembersInContainer(containerId, roster) {
    const container = document.getElementById(containerId);
    if (!container || !roster.members) return;
    
    // Simple member list for comparison view
    const membersHtml = roster.members.map(member => `
        <div class="flex items-center justify-between p-2 border border-border rounded mb-2 member-item" 
             draggable="true" data-member-tag="${member.tag}" data-source-roster="${roster.custom_id}"
             ondragstart="startCrossRosterDrag(event)" ondragend="endCrossRosterDrag(event)">
            <div class="flex items-center gap-2 pointer-events-none">
                <span class="text-xs bg-primary/10 text-primary px-2 py-1 rounded">TH${member.townhall}</span>
                <span class="text-sm font-medium">${member.name}</span>
            </div>
            <span class="text-xs text-muted-foreground pointer-events-none">${member.tag}</span>
        </div>
    `).join('');
    
    container.innerHTML = membersHtml;
}

// Load members table in container (reusing member-display logic)
function loadMembersTableInContainer(containerId, roster, isMainRoster = false, duplicateMembers = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!roster.members || roster.members.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center text-muted-foreground">
                <i data-lucide="users" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                <p>No members in this roster</p>
            </div>
        `;
        return;
    }

    // Use same sorting logic as member-display.js
    const sortConfig = getCurrentSortConfigForRoster(roster);
    const sortedMembers = [...roster.members].sort((a, b) => {
        for (const field of sortConfig) {
            if (!field) continue;
            
            let valueA = a[field];
            let valueB = b[field];
            
            if (valueA == null && valueB == null) continue;
            if (valueA == null) return 1;
            if (valueB == null) return -1;
            
            // Special handling for date fields - ascending order (oldest first)
            const isDateField = field === 'added_at' || field.includes('date') || field.includes('time');
            
            if (typeof valueA === 'string' && typeof valueB === 'string') {
                const comparison = isDateField ? 
                    valueA.toLowerCase().localeCompare(valueB.toLowerCase()) : 
                    valueB.toLowerCase().localeCompare(valueA.toLowerCase());
                if (comparison !== 0) return comparison;
            } else if (typeof valueA === 'number' && typeof valueB === 'number') {
                if (valueA !== valueB) {
                    return isDateField ? 
                        valueA - valueB : 
                        valueB - valueA;
                }
            } else {
                const strA = String(valueA).toLowerCase();
                const strB = String(valueB).toLowerCase();
                const comparison = isDateField ? 
                    strA.localeCompare(strB) : 
                    strB.localeCompare(strA);
                if (comparison !== 0) return comparison;
            }
        }
        return 0;
    });

    // Group by categories like in member-display.js
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

    // Create table using same structure as member-display.js
    const displayColumns = getCurrentDisplayColumnsForRoster(roster);
    let html = createTableHeaderForComparison(displayColumns);
    html += '<tbody>';

    // Add uncategorized members first
    if (uncategorizedMembers.length > 0) {
        html += createGroupSeparatorForComparison('Uncategorized', uncategorizedMembers.length, displayColumns, null);
        uncategorizedMembers.forEach(member => {
            const rosterId = isMainRoster ? currentRosterId : (roster.id || roster.custom_id);
            html += createMemberCardForComparison(member, displayColumns, rosterId, isMainRoster, duplicateMembers);
        });
    }

    // Add categorized members
    categories.forEach(category => {
        const categoryMembers = membersByCategory[category.custom_id] || [];
        if (categoryMembers.length > 0) {
            html += createGroupSeparatorForComparison(category.alias, categoryMembers.length, displayColumns, category.custom_id);
            categoryMembers.forEach(member => {
                const rosterId = isMainRoster ? currentRosterId : (roster.id || roster.custom_id);
                html += createMemberCardForComparison(member, displayColumns, rosterId, isMainRoster, duplicateMembers);
            });
        }
    });

    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Initialize icons
    lucide.createIcons();
}

// Helper functions for comparison tables
function getCurrentDisplayColumnsForRoster(roster) {
    if (!roster.columns) {
        return ['townhall', 'name', 'tag', 'hitrate'];
    }
    
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
    
    return roster.columns.map(col => reverseColumnMapping[col] || col);
}

function getCurrentSortConfigForRoster(roster) {
    if (!roster.sort) {
        return ['townhall', 'name'];
    }
    
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
    
    return roster.sort.map(field => reverseSortMapping[field] || field);
}

function createTableHeaderForComparison(displayColumns) {
    const headers = displayColumns.map(col => {
        const columnName = getColumnDisplayName(col);
        return `<th class="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">${columnName}</th>`;
    }).join('');
    
    return `
        <table class="member-table w-full">
            <thead class="bg-muted/50">
                <tr>
                    ${headers}
                    <th class="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
            </thead>
    `;
}

function createGroupSeparatorForComparison(categoryName, categoryCount, displayColumns, categoryId = null) {
    const totalCols = displayColumns.length + 1;
    console.log(`DEBUG: Creating category drop zone for ${categoryName} (ID: ${categoryId})`);
    
    return `
        <tr class="group-separator">
            <td colspan="${totalCols}" class="px-3 py-3 bg-muted/30 border-y border-border">
                <div class="flex items-center justify-between">
                    <div class="category-drop-zone w-16 h-8 border-2 border-dashed border-border bg-muted/30 hover:border-primary hover:bg-primary/10 rounded flex items-center justify-center transition-colors cursor-pointer"
                         data-category-id="${categoryId || ''}"
                         ondragover="handleCategoryDragOver(event)" 
                         ondragleave="handleCategoryDragLeave(event)"
                         ondrop="handleCategoryDrop(event)"
                         title="Drop here to add to ${categoryName}">
                        <i data-lucide="move" class="w-3 h-3 text-muted-foreground"></i>
                    </div>
                    <h4 class="font-medium text-sm text-center flex-1">${categoryName}</h4>
                    <span class="text-xs text-muted-foreground">${categoryCount} member${categoryCount !== 1 ? 's' : ''}</span>
                </div>
            </td>
        </tr>
    `;
}

function createMemberCardForComparison(member, displayColumns, sourceRosterId, isMainRoster, duplicateMembers = null) {
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
                    // Use same color logic as member-display.js
                    let colorClass = 'text-red-400';
                    if (currentRosterData && member.current_clan_tag === currentRosterData.clan_tag) {
                        colorClass = 'text-green-400';
                    } else if (serverClans && serverClans.some(clan => clan.tag === member.current_clan_tag)) {
                        colorClass = 'text-yellow-400';
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
        }
        columnData.push(cellContent);
    });
    
    // Check if this member is a duplicate
    const isDuplicate = duplicateMembers && duplicateMembers.has(member.tag);
    const duplicateClass = isDuplicate ? 'bg-yellow-500/10 border-l-4 border-l-yellow-500' : '';
    
    return `
        <tr class="member-row hover:bg-accent/50 transition-colors border-b border-border ${duplicateClass}" 
            draggable="true" data-member-tag="${member.tag}" data-source-roster="${sourceRosterId}"
            ondragstart="startCrossRosterDrag(event)" ondragend="endCrossRosterDrag(event)"
            ${isDuplicate ? 'title="⚠️ This member appears in multiple rosters"' : ''}>
            ${columnData.join('')}
            <td class="px-3 py-2 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="removeMemberFromRoster('${member.tag}', '${sourceRosterId}')" 
                            class="w-5 h-5 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                            title="Remove member">
                        <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Show roster selector in comparison view
function showRosterSelector() {
    // Reuse the existing comparison interface but as a modal
    showComparisonInterface();
    
    // Pre-select current comparison rosters
    setTimeout(() => {
        if (comparisonRosters.length > 0) {
            const roster1Select = document.getElementById('comparison-roster-1');
            if (roster1Select && comparisonRosters[0]) {
                roster1Select.value = comparisonRosters[0].id;
            }
        }
        if (comparisonRosters.length > 1) {
            const roster2Select = document.getElementById('comparison-roster-2');
            if (roster2Select && comparisonRosters[1]) {
                roster2Select.value = comparisonRosters[1].id;
            }
        }
    }, 100);
}

// Remove member from any roster (comparison view)
async function removeMemberFromRoster(memberTag, rosterId) {
    if (!confirm(`Remove ${memberTag} from this roster?`)) {
        return;
    }

    try {
        await apiCall(`${API_BASE}/roster/${rosterId}/members/${encodeURIComponent(memberTag)}?server_id=${serverId}`, 'DELETE');
        
        showAlert(`Removed ${memberTag} from roster!`);
        
        // Reload comparison view with fresh data
        if (comparisonRosters.length > 0) {
            await reloadComparisonData();
        } else {
            await loadMembersDisplay();
        }
    } catch (error) {
        console.error('Error removing member:', error);
        showAlert(`Failed to remove ${memberTag}: ${error.message}`, 'error');
    }
}

// Category drop handlers
function handleCategoryDragOver(event) {
    console.log('DEBUG: 🎯 Category drag over!', event.currentTarget.dataset.categoryId);
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('border-primary', 'bg-primary/10');
}

function handleCategoryDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('border-primary', 'bg-primary/10');
    }
}

async function handleCategoryDrop(event) {
    console.log('DEBUG: 🎯 Category drop!', event.currentTarget.dataset.categoryId);
    event.preventDefault();
    event.stopPropagation(); // Prevent parent drop handlers
    
    const categoryId = event.currentTarget.dataset.categoryId;
    const categoryName = categoryId ? categories.find(c => c.custom_id === categoryId)?.alias || 'Unknown' : 'Uncategorized';
    
    // Reset visual state
    event.currentTarget.classList.remove('border-primary', 'bg-primary/10');
    
    try {
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (data.type !== 'cross-roster') return;
        
        console.log(`DEBUG: Category drop - Member: ${data.memberTag}, Category: ${categoryName} (${categoryId})`);
        
        // Find target roster from the current container
        const rosterContainer = event.currentTarget.closest('[data-roster-id]');
        const targetRosterId = rosterContainer?.dataset.rosterId;
        
        if (!targetRosterId) {
            throw new Error('Could not determine target roster');
        }
        
        // Handle undefined source roster
        const sourceRosterId = data.sourceRoster || targetRosterId;
        console.log(`DEBUG: Source: ${sourceRosterId} (original: ${data.sourceRoster}), Target: ${targetRosterId}`);
        
        // If same roster, just update category (no transfer needed)
        if (sourceRosterId === targetRosterId) {
            console.log('DEBUG: Same roster - updating category only');
            await apiCall(`${API_BASE}/roster/${targetRosterId}/members/${encodeURIComponent(data.memberTag)}?server_id=${serverId}`, 'PATCH', {
                signup_group: categoryId || null
            });
            showAlert(`Moved ${data.memberTag} to ${categoryName}!`);
        } else {
            console.log('DEBUG: Different roster - transferring member');
            // Transfer to different roster with category
            await transferMemberBetweenRosters(data.memberTag, sourceRosterId, targetRosterId, categoryId);
        }
        
        // Reload view
        if (comparisonRosters.length > 0) {
            loadComparisonMembersWithTables();
        }
        
    } catch (error) {
        console.error('Category drop error:', error);
        showAlert('Failed to transfer member: ' + error.message, 'error');
    }
}