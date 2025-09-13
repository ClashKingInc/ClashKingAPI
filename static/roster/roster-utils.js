/**
 * Additional Roster Utility Functions
 */

// Clear bulk tags
function clearBulkTags() {
    const textarea = document.getElementById('bulk-tags-input');
    const countSpan = document.getElementById('bulk-tags-count');
    const addButton = document.getElementById('bulk-add-button');
    
    if (textarea) textarea.value = '';
    if (countSpan) countSpan.textContent = '0 tags detected';
    if (addButton) addButton.disabled = true;
}

// Update category counts
function updateCategoryCounts() {
    if (!currentRosterData || !currentRosterData.members) return;
    
    const membersByCategory = {};
    let totalCount = 0;
    
    currentRosterData.members.forEach(member => {
        totalCount++;
        const category = member.signup_group || 'uncategorized';
        membersByCategory[category] = (membersByCategory[category] || 0) + 1;
    });
    
    // Update sidebar total count
    const sidebarCount = document.getElementById('sidebar-member-count');
    if (sidebarCount) {
        sidebarCount.textContent = totalCount;
    }
    
    // Update individual category counts
    Object.keys(membersByCategory).forEach(categoryId => {
        const counter = document.getElementById(`count-${categoryId}`);
        if (counter) {
            counter.textContent = membersByCategory[categoryId];
        }
    });
}

// Create roster info display
function createRosterInfoDisplay(roster) {
    const members = roster.members || [];
    const memberCount = members.length;
    
    // Calculate statistics
    const avgTownhall = memberCount > 0 ? 
        Math.round(members.reduce((sum, m) => sum + (m.townhall || 0), 0) / memberCount * 10) / 10 : 0;
    
    const avgHitrate = memberCount > 0 ? 
        Math.round(members.filter(m => m.hitrate !== null && m.hitrate !== undefined)
        .reduce((sum, m, _, arr) => sum + m.hitrate / arr.length, 0)) : 0;
    
    // Count clan/family/external members
    const clanCount = roster.clan_tag ? members.filter(m => 
        m.current_clan_tag === roster.clan_tag
    ).length : 0;
    
    const familyCount = members.filter(m => {
        if (!m.current_clan_tag || m.current_clan_tag === '#') return false;
        if (roster.clan_tag && m.current_clan_tag === roster.clan_tag) return false; // Don't count main clan members
        return serverClans && serverClans.some(clan => clan.tag === m.current_clan_tag);
    }).length;
    
    const externalCount = memberCount - clanCount - familyCount;
    
    const thRestriction = (roster.min_th !== null && roster.min_th !== undefined) || (roster.max_th !== null && roster.max_th !== undefined) ? 
        getTownhallRestrictionText(roster.min_th, roster.max_th) : 'No restriction';
    
    return `
        <div class="bg-card border border-border rounded-lg mb-6 overflow-hidden">
            <!-- Header with title and quick stats -->
            <div class="bg-muted/30 px-6 py-4 border-b border-border">
                <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-lg flex items-center gap-3">
                        ${roster.clan_name ? `
                            <img src="${roster.clan_badge || '/static/default-clan.png'}" 
                                 alt="Clan Badge" 
                                 class="w-8 h-8 rounded-full border-2 border-border shadow-sm"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                            <i data-lucide="${roster.roster_type === 'family' ? 'users' : 'users-2'}" class="w-5 h-5" style="display: none;"></i>
                        ` : `
                            <i data-lucide="${roster.roster_type === 'family' ? 'users' : 'users-2'}" class="w-5 h-5"></i>
                        `}
                        <div class="flex flex-col">
                            <span>
                                ${roster.alias || 'Roster'}
                                ${thRestriction !== 'No restriction' ? `<span class="text-sm font-normal text-muted-foreground ml-2">(${thRestriction})</span>` : ''}
                            </span>
                            ${roster.roster_type === 'family' && !roster.clan_name ? `
                                <div class="text-sm font-normal text-muted-foreground">
                                    <span>No clan associated</span>
                                </div>
                            ` : roster.clan_name ? `
                                <div class="text-sm font-normal text-muted-foreground flex items-center gap-1">
                                    <span>${roster.clan_name}</span>
                                    ${roster.clan_tag ? `<span class="font-mono">${roster.clan_tag}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </h3>
                    <div class="flex items-center gap-3">
                        <div class="text-sm text-muted-foreground">
                            ${roster.roster_type === 'family' ? 'Family Roster' : 
                              roster.roster_type === 'clan' ? 'Clan Roster' : 
                              'Roster'}
                        </div>
                        ${!comparisonMode ? `
                            <button onclick="toggleComparisonMode()" 
                                    class="px-3 py-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 transition-colors">
                                <i data-lucide="columns" class="w-3 h-3 inline mr-1"></i>
                                Compare
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <!-- Stats Grid -->
            <div class="p-6">
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
                    <!-- Member Stats -->
                    <div class="text-center">
                        <div class="text-2xl font-bold text-primary">${roster.roster_size ? `${memberCount}/${roster.roster_size}` : memberCount}</div>
                        <div class="text-xs text-muted-foreground">Total Members</div>
                    </div>
                    
                    <!-- Average TH -->
                    ${memberCount > 0 ? `
                        <div class="text-center">
                            <div class="text-2xl font-bold text-orange-400">TH${avgTownhall}</div>
                            <div class="text-xs text-muted-foreground">Avg Town Hall</div>
                        </div>
                    ` : ''}
                    
                    <!-- Average Hitrate -->
                    ${memberCount > 0 && avgHitrate > 0 ? `
                        <div class="text-center">
                            <div class="text-2xl font-bold ${avgHitrate >= 80 ? 'text-green-400' : avgHitrate >= 60 ? 'text-yellow-400' : 'text-red-400'}">${avgHitrate}%</div>
                            <div class="text-xs text-muted-foreground">Avg Hit Rate</div>
                        </div>
                    ` : ''}
                    
                    <!-- Clan/Family/External breakdown -->
                    ${memberCount > 0 ? `
                        <div class="text-center">
                            <div class="text-lg font-bold">
                                ${roster.clan_tag ? `
                                    <span class="text-blue-400">${clanCount}</span>
                                    <span class="text-muted-foreground mx-1">/</span>
                                ` : ''}
                                <span class="text-green-400">${familyCount}</span>
                                <span class="text-muted-foreground mx-1">/</span>
                                <span class="text-red-400">${externalCount}</span>
                            </div>
                            <div class="text-xs text-muted-foreground">
                                ${roster.clan_tag ? 'Clan / Family / External' : 'Family / External'}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Get townhall restriction text
function getTownhallRestrictionText(minTh, maxTh) {
    if (minTh && maxTh) {
        if (minTh === maxTh) {
            return `TH${minTh} only`;
        }
        return `TH${minTh}-${maxTh}`;
    } else if (minTh) {
        return `TH${minTh}+`;
    } else if (maxTh) {
        return `TH1-${maxTh}`;
    }
    return 'No restriction';
}

// Note: loadClanMembers function is in api-utils.js to avoid duplication

// Handle column change for display config
function handleColumnChange(event) {
    // Optional: Add any specific logic for column changes
    console.log('Column configuration changed');
}

// Update member cards preview (if needed for future features)
function updateMemberCardsPreview() {
    // Optional: Add preview functionality
    console.log('Updating member cards preview');
}