document.addEventListener('DOMContentLoaded', () => {
    const menteeListDiv = document.getElementById('menteeList');
    const houseFilterSelect = document.getElementById('houseFilter');
    const sortBySelect = document.getElementById('sortBy');
    const sortOrderSelect = document.getElementById('sortOrder');
    const applyFiltersButton = document.getElementById('applyFilters');
    const searchInput = document.getElementById('searchInput');
    const clearSearchButton = document.getElementById('clearSearch');
   
    const responsesModalElement = document.getElementById('responsesModal');
    const responsesModal = new bootstrap.Modal(responsesModalElement);
    const responsesModalBody = document.getElementById('responsesModalBody');
    const responsesModalLabel = document.getElementById('responsesModalLabel');

    async function fetchMentees() {
        const selectedHouse = houseFilterSelect.value;
        const selectedSortBy = sortBySelect.value;
        const selectedSortOrder = sortOrderSelect.value;
        const searchTerm = searchInput.value.trim();

        // Build URL with parameters
        const params = new URLSearchParams({
            sort_by: selectedSortBy,
            sort_order: selectedSortOrder
        });

        if (selectedHouse) {
            params.append('house', selectedHouse);
        }

        if (searchTerm) {
            params.append('search', searchTerm);
        }

        const url = `/api/mentees?${params.toString()}`;

        try {
            menteeListDiv.innerHTML = '<p class="text-center p-5"><i class="bi bi-hourglass-split"></i> Loading mentees...</p>';
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const mentees = await response.json();
            renderMentees(mentees);
        } catch (error) {
            menteeListDiv.innerHTML = `<p class="text-danger text-center p-5"><i class="bi bi-exclamation-triangle-fill"></i> Error loading mentees: ${error.message}</p>`;
            console.error('Failed to fetch mentees:', error);
        }
    }

    function renderMentees(mentees) {
        menteeListDiv.innerHTML = '';
        
        const searchTerm = searchInput.value.trim();
        
        // Show search results info if searching
        if (searchTerm) {
            const infoDiv = document.createElement('div');
            infoDiv.className = 'alert alert-info d-flex justify-content-between align-items-center mb-3';
            infoDiv.innerHTML = `
                <span>
                    <i class="bi bi-info-circle-fill"></i> 
                    Found <strong>${mentees.length}</strong> mentee${mentees.length !== 1 ? 's' : ''} matching "<strong>${escapeHtml(searchTerm)}</strong>"
                </span>
                <button type="button" class="btn btn-sm btn-outline-info" onclick="document.getElementById('searchInput').value=''; document.getElementById('clearSearch').style.display='none'; document.getElementById('applyFilters').click();">
                    Clear Search
                </button>
            `;
            menteeListDiv.appendChild(infoDiv);
        }
        
        if (mentees.length === 0) {
            const message = searchTerm 
                ? `No mentees found matching "${escapeHtml(searchTerm)}". Try a different search term.`
                : 'No mentees found matching your criteria.';
            menteeListDiv.innerHTML += `<p class="text-center p-5 text-muted"><i class="bi bi-person-x"></i> ${message}</p>`;
            return;
        }
        
        mentees.forEach(mentee => {
            const menteeItem = document.createElement('a');
            menteeItem.href = "#";
            menteeItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            menteeItem.setAttribute('data-discord-id', mentee.discord_id);
            menteeItem.setAttribute('data-mentee-name', mentee.name);
            
            const menteeInfo = `
                <div>
                    <h5 class="mb-1">${escapeHtml(mentee.name)}</h5>
                    <small class="text-muted">Discord ID: ${mentee.discord_id}</small>
                    ${mentee.house_role ? `<br><span class="badge bg-info text-dark">${escapeHtml(mentee.house_role)}</span>` : ''}
                </div>
                <span class="badge bg-primary rounded-pill">${mentee.response_count} responses</span>
            `;
            menteeItem.innerHTML = menteeInfo;
            
            menteeItem.addEventListener('click', (e) => {
                e.preventDefault();
                fetchAndShowResponses(mentee.discord_id, mentee.name);
            });
            
            menteeListDiv.appendChild(menteeItem);
        });
    }

    async function fetchAndShowResponses(discordId, menteeName) {
        responsesModalLabel.textContent = `Responses by ${menteeName}`;
        responsesModalBody.innerHTML = '<p class="text-center p-5"><i class="bi bi-hourglass-split"></i> Loading responses...</p>';
        responsesModal.show();
        
        try {
            const response = await fetch(`/api/mentees/${discordId}/responses`);
            if (!response.ok) {
                if (response.status === 404) {
                    responsesModalBody.innerHTML = '<p class="text-center p-5">Mentee found, but no responses recorded yet.</p>';
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responses = await response.json();
            renderResponses(responses);
        } catch (error) {
            responsesModalBody.innerHTML = `<p class="text-danger text-center p-5"><i class="bi bi-exclamation-triangle-fill"></i> Error loading responses: ${error.message}</p>`;
            console.error('Failed to fetch responses:', error);
        }
    }

    function renderResponses(responses) {
        responsesModalBody.innerHTML = '';
        
        if (responses.length === 0) {
            responsesModalBody.innerHTML = '<p class="text-center p-5">No responses recorded for this mentee yet.</p>';
            return;
        }
        
        responses.forEach(resp => {
            const card = document.createElement('div');
            card.className = 'response-card mb-3';
            const createdAt = new Date(resp.created_at).toLocaleString();
            
            let responseContent = `<h6>Week ${resp.week_number} - <small class="text-muted">${createdAt}</small></h6>`;
            
            if (resp.text_response) {
                responseContent += `<p><strong>Text:</strong> ${escapeHtml(resp.text_response)}</p>`;
            }
            
            if (resp.voice_response_url) {
                responseContent += `
                    <p><strong>Voice:</strong>
                        <a href="${resp.voice_response_url}" target="_blank" class="voice-response-link">
                            <i class="bi bi-mic-fill"></i> Listen to Voice Message
                        </a>
                    </p>`;
            }
            
            card.innerHTML = responseContent;
            responsesModalBody.appendChild(card);
        });
    }
   
    function escapeHtml(unsafe) {
        if (unsafe === null || typeof unsafe === 'undefined') return '';
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async function populateHouseFilter() {
        try {
            const response = await fetch('/api/houses');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const houses = await response.json();
            houses.forEach(house => {
                const option = document.createElement('option');
                option.value = house;
                option.textContent = house;
                houseFilterSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to fetch houses:', error);
        }
    }

    // Event Listeners
    
    // Apply filters button
    applyFiltersButton.addEventListener('click', fetchMentees);
    
    // Search on Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            fetchMentees();
        }
    });
    
    // Show/hide clear button
    searchInput.addEventListener('input', (e) => {
        clearSearchButton.style.display = e.target.value ? 'inline-block' : 'none';
    });
    
    // Clear search button
    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchButton.style.display = 'none';
        fetchMentees();
        searchInput.focus();
    });
    
    // Clear search on Escape key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            clearSearchButton.style.display = 'none';
            fetchMentees();
        }
    });

    // Initial data load
    populateHouseFilter();
    fetchMentees();
});