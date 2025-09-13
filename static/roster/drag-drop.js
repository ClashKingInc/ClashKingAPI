/**
 * Drag and Drop Functions for Member Management
 */

function dragStart(event) {
    console.log('=== DRAG START ===');
    console.log('Drag started for:', event.currentTarget.dataset.memberTag);
    console.log('Current element:', event.currentTarget);
    console.log('Event target:', event.target);
    console.log('dataTransfer available:', !!event.dataTransfer);
    console.log('Element draggable:', event.currentTarget.draggable);
    console.log('Element has data-member-tag:', !!event.currentTarget.dataset.memberTag);
    
    // Find which category this member belongs to (simplified)
    const memberTag = event.currentTarget.dataset.memberTag;
    const memberRow = event.currentTarget;
    let categoryText = 'unknown';
    let currentElement = memberRow.previousElementSibling;
    
    // Look backwards to find the group separator  
    while (currentElement) {
        if (currentElement.classList.contains('group-separator')) {
            const categoryNameElement = currentElement.querySelector('h4');
            categoryText = categoryNameElement ? categoryNameElement.textContent.trim() : 'unknown';
            break;
        }
        currentElement = currentElement.previousElementSibling;
    }
    
    console.log('🎯 MEMBER CATEGORY:', categoryText);
    console.log('🎯 MEMBER TAG:', memberTag);
    
    // Find member's position in table
    const allMemberRows = document.querySelectorAll('.member-row');
    const memberIndex = Array.from(allMemberRows).indexOf(event.currentTarget);
    console.log('🎯 MEMBER POSITION:', memberIndex + 1, 'of', allMemberRows.length);
    
    // Try to prevent any default behavior that might cancel drag
    // event.stopPropagation(); // Let's try without this first
    
    try {
        event.dataTransfer.setData('text/plain', event.currentTarget.dataset.memberTag);
        event.dataTransfer.effectAllowed = 'move';
    } catch (e) {
        console.error('Error setting dataTransfer:', e);
        return false;
    }
    
    event.currentTarget.classList.add('dragging');
    // Force CSS styles to make sure they apply
    event.currentTarget.style.opacity = '0.5';
    event.currentTarget.style.transform = 'scale(0.95)';

    // Capture the dragging element reference before setTimeout
    const draggingElement = event.currentTarget;
    
    // Use a small delay to ensure the drag has properly started
    setTimeout(() => {
        // Show all drop zones during drag
        const dropRows = document.querySelectorAll('.empty-drop-row');
        console.log('Found drop rows:', dropRows.length);
        dropRows.forEach((dropRow, index) => {
            console.log(`Drop row ${index}:`, dropRow);
            console.log(`Before: hidden=${dropRow.classList.contains('hidden')}, border-muted=${dropRow.classList.contains('border-muted')}`);
            dropRow.classList.remove('hidden');
            dropRow.classList.add('border-muted'); // Make border visible
            console.log(`After: hidden=${dropRow.classList.contains('hidden')}, border-muted=${dropRow.classList.contains('border-muted')}`);
        });

        // Also debug the dragging element
        console.log('Dragging element classes:', draggingElement.className);

        // Add drag-over class listeners
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.addEventListener('dragenter', handleDragEnter);
            zone.addEventListener('dragleave', handleDragLeave);
        });
    }, 50); // Small delay to ensure drag has started properly
    
    // Alternative approach - also add a dragover listener to the table to make zones visible
    const membersTable = document.getElementById('members-table');
    if (membersTable && !membersTable.dragoverHandlerAdded) {
        membersTable.addEventListener('dragover', function(e) {
            e.preventDefault(); // Allow drop
            // Make sure drop zones are visible during drag
            const dropRows = document.querySelectorAll('.empty-drop-row');
            dropRows.forEach(dropRow => {
                dropRow.classList.remove('hidden');
                dropRow.classList.add('border-muted');
            });
        });
        membersTable.dragoverHandlerAdded = true;
    }
}

function dragEnd(event) {
    console.log('=== DRAG END ===');
    console.log('Drag ended for:', event.currentTarget.dataset.memberTag);
    console.log('Drop effect:', event.dataTransfer?.dropEffect);
    console.log('Effective allowed:', event.dataTransfer?.effectAllowed);
    
    // Find which category this member belongs to for debugging
    const memberTag = event.currentTarget.dataset.memberTag;
    const memberRow = event.currentTarget;
    let categoryText = 'unknown';
    let currentElement = memberRow.previousElementSibling;
    
    // Look backwards to find the group separator  
    while (currentElement) {
        if (currentElement.classList.contains('group-separator')) {
            const categoryNameElement = currentElement.querySelector('h4');
            categoryText = categoryNameElement ? categoryNameElement.textContent.trim() : 'unknown';
            break;
        }
        currentElement = currentElement.previousElementSibling;
    }
    
    console.log('🎯 DRAG END CATEGORY:', categoryText);
    
    event.currentTarget.classList.remove('dragging');
    // Remove forced CSS styles
    event.currentTarget.style.opacity = '';
    event.currentTarget.style.transform = '';

    // Hide all drop zones after drag
    document.querySelectorAll('.empty-drop-row').forEach(dropRow => {
        dropRow.classList.add('hidden');
        dropRow.classList.remove('border-muted'); // Remove visible border
    });

    // Remove drag-over classes and listeners
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.classList.remove('drag-over');
        zone.removeEventListener('dragenter', handleDragEnter);
        zone.removeEventListener('dragleave', handleDragLeave);
    });
}

function handleDragEnter(event) {
    event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
    }
}

// Handle drop events
function handleDrop(event, categoryId) {
    event.preventDefault();
    
    const memberTag = event.dataTransfer.getData('text/plain');
    if (!memberTag) return;

    console.log('Drop event:', memberTag, 'to category:', categoryId);
    
    // Move member to new category
    moveMemberToCategory(memberTag, categoryId);
}

// Move member to different category
async function moveMemberToCategory(memberTag, newCategoryId) {
    try {
        const updateData = {
            signup_group: newCategoryId || null
        };

        await apiCall(`${API_BASE}/roster/${currentRosterId}/members/${encodeURIComponent(memberTag)}?server_id=${serverId}`, 'PATCH', updateData);
        
        const categoryName = newCategoryId ? 
            categories.find(c => c.custom_id === newCategoryId)?.alias || 'Unknown' : 
            'Uncategorized';
            
        showAlert(`Moved ${memberTag} to ${categoryName}!`);
        await loadMembersDisplay();
    } catch (error) {
        console.error('Error moving member:', error);
        showAlert(`Failed to move ${memberTag}: ${error.message}`, 'error');
    }
}

// Cross-roster drag and drop functions
function startCrossRosterDrag(event) {
    console.log('🚀 DEBUG: Cross-roster drag started');
    console.log('DEBUG: Event target:', event.target);
    console.log('DEBUG: Current target:', event.currentTarget);
    console.log('DEBUG: Current target attributes:', event.currentTarget.attributes);
    
    const memberTag = event.currentTarget.getAttribute('data-member-tag');
    let sourceRoster = event.currentTarget.getAttribute('data-source-roster');
    
    console.log('DEBUG: Member tag:', memberTag);
    console.log('DEBUG: Source roster from attribute:', sourceRoster);
    
    // If no source roster attribute, try to find it from the container
    if (!sourceRoster) {
        const container = event.currentTarget.closest('[data-roster-id]');
        sourceRoster = container?.dataset.rosterId;
        console.log('DEBUG: Source roster from container:', sourceRoster);
    }
    
    // Final fallback for main roster
    if (!sourceRoster) {
        const mainContainer = event.currentTarget.closest('#main-roster-content');
        if (mainContainer) {
            sourceRoster = currentRosterId;
            console.log('DEBUG: Source roster fallback to currentRosterId:', sourceRoster);
        }
    }
    
    console.log('DEBUG: Final source roster:', sourceRoster);
    
    if (!memberTag || !sourceRoster) {
        console.error('DEBUG: Missing member tag or source roster', {memberTag, sourceRoster});
        return;
    }
    
    event.dataTransfer.setData('text/plain', JSON.stringify({
        memberTag: memberTag,
        sourceRoster: sourceRoster,
        type: 'cross-roster'
    }));
    
    // Add visual feedback
    event.target.style.opacity = '0.5';
    
    // Show drop zones on other rosters
    showCrossRosterDropZones(sourceRoster);
}

function endCrossRosterDrag(event) {
    console.log('DEBUG: Cross-roster drag ended');
    
    // Reset opacity
    event.target.style.opacity = '1';
    
    // Remove drop zones if they exist
    setTimeout(() => {
        removeCrossRosterDropZones();
    }, 100);
}

function showCrossRosterDropZones(sourceRosterId) {
    console.log('DEBUG: Showing drop zones for source:', sourceRosterId);
    console.log('DEBUG: Current comparison mode:', window.comparisonMode || 'not set');
    console.log('DEBUG: Comparison rosters count:', window.comparisonRosters?.length || 0);
    
    // Add drop zones to all roster containers except the source
    const containers = document.querySelectorAll('[id*="roster"][id*="content"]');
    console.log('DEBUG: Found containers:', containers.length, [...containers].map(c => c.id));
    console.log('DEBUG: All div IDs in page:', [...document.querySelectorAll('div[id]')].map(d => d.id).filter(id => id.includes('roster')));
    
    containers.forEach(container => {
        const containerId = container.id;
        const containerRosterId = container.dataset.rosterId;
        console.log(`DEBUG: Processing container: ${containerId}, roster ID: ${containerRosterId}, source: ${sourceRosterId}`);
        
        // Only add drop zone if it's a DIFFERENT roster (cross-roster transfer)
        if (containerRosterId !== sourceRosterId && containerRosterId !== undefined && sourceRosterId !== undefined) {
            console.log(`DEBUG: ✅ Adding drop zone to container: ${containerId} (cross-roster transfer)`);
            addDropZoneToContainer(container);
        } else {
            console.log(`DEBUG: ❌ Skipping container: ${containerId} - same roster or undefined IDs`);
        }
    });
}

function addDropZoneToContainer(container) {
    console.log('DEBUG: Adding drop zone to container:', container.id);
    console.log('DEBUG: Container classes:', container.className);
    console.log('DEBUG: Container parent:', container.parentElement);
    
    // Remove existing drop zone if any
    const existingDropZone = container.querySelector('.drop-zone');
    if (existingDropZone) {
        existingDropZone.remove();
    }
    
    // Find the parent card container instead of the content div
    const cardContainer = container.closest('.bg-card');
    if (!cardContainer) {
        console.error('DEBUG: Could not find card container');
        return;
    }
    
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone p-4 border-2 border-dashed border-border bg-muted/30 rounded-lg text-center text-sm font-medium text-muted-foreground m-4 transition-all duration-200';
    dropZone.innerHTML = `
        <div class="flex items-center justify-center gap-2">
            <i data-lucide="move" class="w-4 h-4"></i>
            <span>Drop member here to transfer</span>
        </div>
    `;
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropZone.classList.remove('border-border', 'bg-muted/30', 'text-muted-foreground');
        dropZone.classList.add('border-primary', 'bg-primary/10', 'text-primary');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('border-primary', 'bg-primary/10', 'text-primary');
            dropZone.classList.add('border-border', 'bg-muted/30', 'text-muted-foreground');
        }
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        console.log('DEBUG: Drop event on container:', container.id);
        handleCrossRosterDrop(e, container.id);
    });
    
    // Insert at the end of the card container
    cardContainer.appendChild(dropZone);
    console.log('DEBUG: Drop zone added successfully to card container');
    
    // Initialize lucide icons
    lucide.createIcons();
}

async function handleCrossRosterDrop(event, containerId) {
    let data;
    try {
        data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (data.type !== 'cross-roster') return;
        
        // Determine target roster from container data attribute
        const container = document.getElementById(containerId);
        console.log(`DEBUG: Container found:`, container);
        console.log(`DEBUG: Container dataset:`, container?.dataset);
        console.log(`DEBUG: Container ID: ${containerId}`);
        console.log(`DEBUG: currentRosterId: ${currentRosterId}`);
        
        let targetRosterId = container?.dataset.rosterId;
        
        // Fallback: if this is the main roster container, use currentRosterId
        if (!targetRosterId && containerId === 'main-roster-content') {
            targetRosterId = currentRosterId;
            console.log(`DEBUG: Using fallback currentRosterId: ${targetRosterId}`);
        }
        
        if (!targetRosterId) {
            throw new Error(`Could not determine target roster ID for container: ${containerId}`);
        }
        
        console.log(`DEBUG: Transferring ${data.memberTag} from ${data.sourceRoster} to ${targetRosterId}`);
        
        // Validate IDs before transfer
        if (!data.sourceRoster || !targetRosterId) {
            throw new Error(`Invalid roster IDs - source: ${data.sourceRoster}, target: ${targetRosterId}`);
        }
        
        // Show category selection modal first
        await showCategorySelectionModal(data.memberTag, data.sourceRoster, targetRosterId);
        
        // Reload comparison view with fresh data
        console.log('DEBUG: Reloading comparison view with fresh data...');
        await reloadComparisonData();
        
    } catch (error) {
        console.error('Cross-roster drop error:', error);
        showAlert('Failed to transfer member: ' + error.message, 'error');
    } finally {
        // Clean up drop zones
        removeCrossRosterDropZones();
        
        // Reset member opacity
        const draggedElement = document.querySelector(`[data-member-tag="${data?.memberTag}"]`);
        if (draggedElement) {
            draggedElement.style.opacity = '1';
        }
    }
}

function removeCrossRosterDropZones() {
    const dropZones = document.querySelectorAll('.drop-zone');
    console.log('DEBUG: Removing', dropZones.length, 'drop zones');
    dropZones.forEach(zone => zone.remove());
}

// Show category selection modal before transfer
async function showCategorySelectionModal(memberTag, sourceRosterId, targetRosterId) {
    return new Promise((resolve, reject) => {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
                <h3 class="text-lg font-semibold mb-4">Select Category for ${memberTag}</h3>
                
                <div class="space-y-3 mb-6">
                    <label class="flex items-center gap-2">
                        <input type="radio" name="category" value="" checked>
                        <span>Uncategorized</span>
                    </label>
                    ${categories.map(cat => `
                        <label class="flex items-center gap-2">
                            <input type="radio" name="category" value="${cat.custom_id}">
                            <span>${cat.alias}</span>
                        </label>
                    `).join('')}
                </div>
                
                <div class="flex gap-3 justify-end">
                    <button id="cancel-transfer" class="px-4 py-2 text-sm border border-border rounded hover:bg-accent">
                        Cancel
                    </button>
                    <button id="confirm-transfer" class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
                        Transfer
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle cancel
        modal.querySelector('#cancel-transfer').addEventListener('click', () => {
            modal.remove();
            reject(new Error('Transfer cancelled'));
        });
        
        // Handle confirm
        modal.querySelector('#confirm-transfer').addEventListener('click', async () => {
            const selectedCategory = modal.querySelector('input[name="category"]:checked')?.value || null;
            modal.remove();
            
            try {
                await transferMemberBetweenRosters(memberTag, sourceRosterId, targetRosterId, selectedCategory);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                reject(new Error('Transfer cancelled'));
            }
        });
    });
}

async function transferMemberBetweenRosters(memberTag, sourceRosterId, targetRosterId, categoryId = null) {
    try {
        console.log(`DEBUG: Transfer function - source: ${sourceRosterId}, target: ${targetRosterId}, member: ${memberTag}, category: ${categoryId}`);
        
        // Validate all required parameters
        if (!memberTag || !sourceRosterId || !targetRosterId) {
            throw new Error(`Missing required parameters - member: ${memberTag}, source: ${sourceRosterId}, target: ${targetRosterId}`);
        }
        
        // Remove from source roster
        console.log(`DEBUG: Removing from source roster ${sourceRosterId}`);
        await apiCall(`${API_BASE}/roster/${sourceRosterId}/members/${encodeURIComponent(memberTag)}?server_id=${serverId}`, 'DELETE');
        
        // Add to target roster with selected category
        console.log(`DEBUG: Adding to target roster ${targetRosterId}`);
        await apiCall(`${API_BASE}/roster/${targetRosterId}/members?server_id=${serverId}`, 'POST', {
            add: [{ tag: memberTag, signup_group: categoryId }]
        });
        
        const categoryName = categoryId ? 
            categories.find(c => c.custom_id === categoryId)?.alias || 'Unknown' : 
            'Uncategorized';
            
        showAlert(`Successfully transferred ${memberTag} to ${categoryName}!`);
        
    } catch (error) {
        throw new Error(`Transfer failed: ${error.message}`);
    }
}