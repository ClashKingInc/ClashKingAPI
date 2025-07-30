document.addEventListener('DOMContentLoaded', function() {
    const containers = [document.getElementById('clan1'), document.getElementById('clan2'), document.querySelector('.trash-bin')];

    dragula(containers, {
        copy: false,
        removeOnSpill: true,
        moves: function (el, container, handle) {
            return true;
        }
    }).on('drop', function(el, target, source, sibling) {
        if (target.classList.contains('trash-bin')) {
            el.remove();
        }
    });

    // Implement search functionality
    const searchInputs = document.querySelectorAll('.search-bar');
    searchInputs.forEach(searchInput => {
        searchInput.addEventListener('input', async function() {
            const query = this.value;
            const response = await fetch(`/search?query=${query}`);
            const data = await response.json();
            const resultsContainer = document.createElement('div');
            resultsContainer.className = 'search-results bg-gray-700 text-white p-2 mt-2 rounded';
            resultsContainer.innerHTML = data.results.map(player => `<div class="player-card">${player.name} - TH ${player.townhall}</div>`).join('');
            this.parentNode.appendChild(resultsContainer);
        });
    });

    // Handle add buttons
    const addButtons = document.querySelectorAll('.add-button');
    addButtons.forEach(addButton => {
        addButton.addEventListener('click', function() {
            const searchInput = this.previousElementSibling;
            const query = searchInput.value;
            // Implement the add functionality here, e.g., adding the player to the roster
        });
    });

    // Handle roster swapping via dropdown
    const clanSelects = document.querySelectorAll('select');
    clanSelects.forEach(clanSelect => {
        clanSelect.addEventListener('change', function() {
            const selectedClanTag = this.value;
            const containerId = this.id.replace('-select', '');
            // Implement logic to update the roster based on the selected clan
            fetch(`/roster?clan_tag=${selectedClanTag}`).then(response => response.json()).then(data => {
                const container = document.getElementById(containerId);
                container.innerHTML = data.members.map(member => `
                    <div class="player-card" data-tag="${member.tag}">
                        <p class="font-bold">${member.name}</p>
                        <p class="text-sm">Tag: ${member.tag}</p>
                        <p class="text-sm">TH: ${member.townhall}</p>
                        <p class="text-sm">Heroes: ${member.hero_lvs}</p>
                        <p class="text-sm">Trophies: ${member.trophies}</p>
                    </div>
                `).join('');
            });
        });
    });
});

