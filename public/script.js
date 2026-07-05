// State Management
let accounts = {};
let activeAccount = null;
let currentEmails = [];
let filteredEmails = [];
let currentFolder = "inbox"; // inbox, starred, spam

// DOM Elements
const accountSelector = document.getElementById("account-selector");
const activeBadge = document.getElementById("active-account-badge");
const maxResults = document.getElementById("max-results");
const btnDec = document.getElementById("btn-dec");
const btnInc = document.getElementById("btn-inc");

const fetchBtn = document.getElementById("fetch-btn");
const summarizeBtn = document.getElementById("summarize-btn");
const emailList = document.getElementById("email-list");
const summaryContent = document.getElementById("summary-content");
const selectionCounter = document.getElementById("selection-counter");
const loader = document.getElementById("loader");
const loaderMsg = document.getElementById("loader-msg");
const toast = document.getElementById("toast");
const profileInitial = document.getElementById("profile-initial");

// New UI Elements
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const selectAllCheckbox = document.getElementById("select-all");
const refreshListBtn = document.getElementById("refresh-list-btn");
const rightPanel = document.getElementById("right-panel");
const toggleSummaryBtn = document.getElementById("toggle-summary-btn");
const menuBtn = document.getElementById("menu-btn");
const sidebar = document.getElementById("sidebar");

// Folder Nav Elements
const navInbox = document.getElementById("nav-inbox");
const navStarred = document.getElementById("nav-starred");
const navSpam = document.getElementById("nav-spam");



// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    // 1. Load accounts from LocalStorage
    loadAccounts();

    // 2. Handle URL parameters (redirect from Google OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get("token");
    const oauthEmail = urlParams.get("email");

    if (oauthToken && oauthEmail) {
        try {
            // Base64 decode credentials JSON
            const decodedJson = atob(oauthToken);
            const credentials = JSON.parse(decodedJson);
            
            // Save to local storage
            accounts[oauthEmail] = credentials;
            saveAccounts();
            
            // Set as active account
            activeAccount = oauthEmail;
            localStorage.setItem("active_account", activeAccount);
            
            showToast(`Connected account ${oauthEmail} successfully!`, "success");
        } catch (e) {
            console.error("Failed to parse OAuth redirect credentials:", e);
            showToast("Failed to parse sign-in credentials.", "danger");
        }
        
        // Clean URL query parameters
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        // Retrieve active account
        activeAccount = localStorage.getItem("active_account");
        if (activeAccount && !accounts[activeAccount]) {
            activeAccount = Object.keys(accounts)[0] || null;
        }
    }

    // Update Profile Icon
    updateProfileIcon();

    // 3. Render account dropdown list
    renderAccountDropdown();

    // 4. Register Event Listeners
    
    // Numeric spinner decrement/increment
    if (btnDec && btnInc && maxResults) {
        btnDec.addEventListener("click", () => {
            let val = parseInt(maxResults.value) || 5;
            if (val > 1) {
                maxResults.value = val - 1;
                maxResults.dispatchEvent(new Event("change"));
            }
        });
        btnInc.addEventListener("click", () => {
            let val = parseInt(maxResults.value) || 5;
            if (val < 100) {
                maxResults.value = val + 1;
                maxResults.dispatchEvent(new Event("change"));
            }
        });
    }

    // Search Bar Input & Reset
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.trim();
            if (query.length > 0) {
                clearSearchBtn.classList.remove("hidden");
            } else {
                clearSearchBtn.classList.add("hidden");
            }
            applyFilters();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            clearSearchBtn.classList.add("hidden");
            applyFilters();
        });
    }

    // Select All Checkbox
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", (e) => {
            const checked = e.target.checked;
            const visibleCards = emailList.querySelectorAll(".email-card");
            visibleCards.forEach(card => {
                const emailId = card.id.replace("card-", "");
                const checkbox = document.getElementById(`check-${emailId}`);
                if (checkbox) {
                    checkbox.checked = checked;
                    if (checked) {
                        card.classList.add("selected");
                    } else {
                        card.classList.remove("selected");
                    }
                }
            });
            updateSelectionCounters();
        });
    }

    // Refresh button
    if (refreshListBtn) {
        refreshListBtn.addEventListener("click", fetchInbox);
    }

    // Left Collapsible Sidebar (Menu toggler)
    if (menuBtn && sidebar) {
        menuBtn.addEventListener("click", () => {
            sidebar.classList.toggle("collapsed");
        });
    }

    // Right Collapsible AI Summary Panel
    if (toggleSummaryBtn && rightPanel) {
        toggleSummaryBtn.addEventListener("click", () => {
            if (rightPanel.classList.contains("open")) {
                rightPanel.classList.remove("open");
                rightPanel.classList.add("closed");
                toggleSummaryBtn.classList.remove("active");
            } else {
                rightPanel.classList.remove("closed");
                rightPanel.classList.add("open");
                toggleSummaryBtn.classList.add("active");
            }
        });
    }

    // Folder navigation triggers
    if (navInbox) {
        navInbox.addEventListener("click", () => {
            currentFolder = "inbox";
            setActiveNav(navInbox);
            applyFilters();
        });
    }
    if (navStarred) {
        navStarred.addEventListener("click", () => {
            currentFolder = "starred";
            setActiveNav(navStarred);
            applyFilters();
        });
    }
    if (navSpam) {
        navSpam.addEventListener("click", () => {
            currentFolder = "spam";
            setActiveNav(navSpam);
            applyFilters();
        });
    }



    accountSelector.addEventListener("change", handleAccountSelect);
    fetchBtn.addEventListener("click", fetchInbox);
    summarizeBtn.addEventListener("click", generateSummary);
});

// Update Profile Circle text
function updateProfileIcon() {
    if (profileInitial) {
        if (activeAccount) {
            profileInitial.textContent = activeAccount.charAt(0).toUpperCase();
        } else {
            profileInitial.textContent = "G";
        }
    }
}

// Active sidebar navigations highlights
function setActiveNav(activeElement) {
    [navInbox, navStarred, navSpam].forEach(el => {
        if (el) el.classList.remove("active");
    });
    if (activeElement) activeElement.classList.add("active");
}



// Accounts Cache Helpers
function loadAccounts() {
    try {
        const stored = localStorage.getItem("gmail_accounts");
        if (stored) {
            accounts = JSON.parse(stored);
        }
    } catch (e) {
        console.error("Failed to load accounts from storage:", e);
        accounts = {};
    }
}

function saveAccounts() {
    localStorage.setItem("gmail_accounts", JSON.stringify(accounts));
}

function renderAccountDropdown() {
    const hasAccounts = Object.keys(accounts).length > 0;
    let html = "";
    if (!hasAccounts) {
        html += '<option value="" disabled selected hidden>Choose Gmail Account...</option>';
    }
    html += '<option value="add_new">➕ Add New Account...</option>';
    accountSelector.innerHTML = html;
    
    Object.keys(accounts).forEach(email => {
        const opt = document.createElement("option");
        opt.value = email;
        opt.textContent = email;
        if (email === activeAccount) {
            opt.selected = true;
        }
        // Insert before the last option
        accountSelector.insertBefore(opt, accountSelector.lastElementChild);
    });

    updateActiveBadge();
}

function updateActiveBadge() {
    if (activeAccount && accounts[activeAccount]) {
        activeBadge.textContent = `${activeAccount}`;
        activeBadge.className = "account-badge active";
        fetchBtn.disabled = false;
    } else {
        activeBadge.textContent = "⚠️ No active account";
        activeBadge.className = "account-badge inactive";
        fetchBtn.disabled = true;
    }
    updateProfileIcon();
}

// Event handlers
async function handleAccountSelect(e) {
    const val = e.target.value;
    
    if (val === "add_new") {
        showLoader("Requesting Google login URL...");
        try {
            const res = await fetch("/api/auth_url");
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            
            // Redirect to Google login screen
            window.location.href = data.auth_url;
        } catch (err) {
            console.error("Auth URL fetch error:", err);
            showToast("Failed to initiate login flow.", "danger");
            hideLoader();
            // Reset selector to active account
            accountSelector.value = activeAccount || "add_new";
        }
    } else {
        activeAccount = val;
        localStorage.setItem("active_account", activeAccount);
        updateActiveBadge();
        
        // Reset dashboard listings
        currentEmails = [];
        applyFilters();
        summaryContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <h3>Summary will appear here</h3>
                <p>Select at least one email from the list and click "Generate AI Summary".</p>
            </div>
        `;
        summaryContent.className = "summary-container empty";
        summarizeBtn.disabled = true;
    }
}

// Fetch Inbox Emails
async function fetchInbox() {
    if (!activeAccount || !accounts[activeAccount]) {
        showToast("Please choose or add an account first.", "danger");
        return;
    }

    showLoader("Fetching emails from inbox...");
    
    try {
        const res = await fetch("/api/fetch_emails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                credentials: accounts[activeAccount],
                max_results: parseInt(maxResults.value)
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
        }

        const data = await res.json();
        currentEmails = data.emails || [];
        
        applyFilters();
        showToast(`Successfully fetched ${currentEmails.length} emails!`, "success");
    } catch (e) {
        console.error("Fetch inbox error:", e);
        showToast("Failed to fetch emails. Access token may be expired.", "danger");
    } finally {
        hideLoader();
    }
}

// Filters logic combining Search, Sidebar Navigation folders and filter tabs
function applyFilters() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    filteredEmails = currentEmails.filter(email => {
        // 1. Sidebar Folder check
        if (currentFolder === "starred" && email.predicted_class !== "important") return false;
        if (currentFolder === "spam" && email.predicted_class !== "junk") return false;
        

        
        // 3. Search Bar query matching
        if (query) {
            const subject = (email.subject || "").toLowerCase();
            const from = (email.from || "").toLowerCase();
            const snippet = (email.snippet || "").toLowerCase();
            const body = (email.body || "").toLowerCase();
            if (!subject.includes(query) && !from.includes(query) && !snippet.includes(query) && !body.includes(query)) {
                return false;
            }
        }
        
        return true;
    });
    
    // Update Badge counts dynamically
    updateNavBadges();
    
    // Update Pagination controls info
    const totalCount = filteredEmails.length;
    const paginationInfo = document.getElementById("pagination-info");
    if (paginationInfo) {
        paginationInfo.textContent = totalCount > 0 ? `1-${totalCount} of ${totalCount}` : "0-0 of 0";
    }
    
    renderFilteredEmails();
}

function updateNavBadges() {
    const inboxCount = document.getElementById("inbox-count");
    const starredCount = document.getElementById("starred-count");
    const junkCount = document.getElementById("junk-count");
    
    if (inboxCount) {
        inboxCount.textContent = currentEmails.length;
    }
    if (starredCount) {
        starredCount.textContent = currentEmails.filter(e => e.predicted_class === "important").length;
    }
    if (junkCount) {
        junkCount.textContent = currentEmails.filter(e => e.predicted_class === "junk").length;
    }
}

// Render Filtered Gmail-styled Cards
function renderFilteredEmails() {
    if (filteredEmails.length === 0) {
        emailList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📥</div>
                <h3>No emails match filters</h3>
                <p>Try resetting search or filters to see emails.</p>
            </div>
        `;
        emailList.className = "email-list empty";
        selectionCounter.textContent = "Selected 0 of 0";
        summarizeBtn.disabled = true;
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        return;
    }

    emailList.className = "email-list";
    emailList.innerHTML = "";

    filteredEmails.forEach(email => {
        const cls = email.predicted_class; // 'none', 'important', or 'junk'
        const isImportant = cls === "important";
        const isJunk = cls === "junk";
        
        const card = document.createElement("div");
        card.className = `email-card ${isImportant ? 'unread' : ''}`;
        card.id = `card-${email.id}`;

        const starChar = isImportant ? "★" : "☆";
        const starClass = isImportant ? "starred" : "";
        // Only show badge when user has set a label
        const badgeHtml = isImportant 
            ? `<span id="badge-${email.id}" class="badge important">Important</span>`
            : isJunk 
                ? `<span id="badge-${email.id}" class="badge junk">Junk</span>`
                : `<span id="badge-${email.id}"></span>`; // no label yet
        
        // Extract sender name from "Name <email@gmail.com>"
        let senderName = email.from || "Unknown";
        if (senderName.includes("<")) {
            senderName = senderName.split("<")[0].trim();
        }
        
        // Parse date to shorter string
        let dateDisplay = email.date || "";
        if (dateDisplay.includes(",")) {
            const parts = dateDisplay.split(",");
            if (parts.length > 1) {
                dateDisplay = parts[1].trim().split(" ").slice(0, 2).join(" ");
            }
        }
        
        card.innerHTML = `
            <div class="email-card-check">
                <input type="checkbox" id="check-${email.id}" class="checkbox-custom" ${isImportant ? 'checked' : ''} onclick="event.stopPropagation()">
            </div>
            <div class="star-btn ${starClass}" onclick="toggleStar(event, '${email.id}')" title="Toggle Important/Junk label">${starChar}</div>
            
            <div class="email-card-content" onclick="toggleExpandRow('${email.id}')">
                <div class="email-from-col">${escapeHtml(senderName)}</div>
                <div class="email-info-col">
                    <span class="email-subject">${escapeHtml(email.subject)}</span>
                    <span class="email-snippet-separator">&nbsp;-&nbsp;</span>
                    <span class="email-snippet-text">${escapeHtml(email.snippet)}</span>
                </div>
            <div class="email-badge-col">${badgeHtml}</div>
                <div class="email-date-col">${escapeHtml(dateDisplay)}</div>
            </div>
            
            <!-- Quick Action hover links -->
            <div class="email-card-actions-hover">
                <button class="icon-btn" onclick="toggleStar(event, '${email.id}')" title="Star (Toggle Important)">⭐</button>
                <button class="icon-btn" onclick="toggleSpam(event, '${email.id}')" title="Mark Spam/Inbox">⚠️</button>
                <button class="icon-btn" onclick="toggleExpandRow('${email.id}')" title="Preview Email">👁️</button>
            </div>
        `;

        emailList.appendChild(card);
        
        // Bind checkbox selection change
        const checkbox = document.getElementById(`check-${email.id}`);
        checkbox.addEventListener("change", (e) => {
            if (e.target.checked) {
                card.classList.add("selected");
            } else {
                card.classList.remove("selected");
            }
            updateSelectionCounters();
        });

        // Set card selection highlight default
        if (checkbox.checked) {
            card.classList.add("selected");
        }
    });

    updateSelectionCounters();
}

// Star Click Action — marks as Important (or toggles back to none)
window.toggleStar = async function(event, emailId) {
    if (event) event.stopPropagation();
    const email = currentEmails.find(e => e.id === emailId);
    if (!email) return;
    
    // none → important, important → none, junk → important
    const newClass = email.predicted_class === "important" ? "none" : "important";
    await updateEmailLabel(emailId, newClass);
};

// Spam Hover Icon Action — marks as Junk (or toggles back to none)
window.toggleSpam = async function(event, emailId) {
    if (event) event.stopPropagation();
    const email = currentEmails.find(e => e.id === emailId);
    if (!email) return;
    
    // none → junk, junk → none, important → junk
    const newClass = email.predicted_class === "junk" ? "none" : "junk";
    await updateEmailLabel(emailId, newClass);
};

// Expand Mail Card Details Row
window.toggleExpandRow = function(emailId) {
    const card = document.getElementById(`card-${emailId}`);
    if (!card) return;
    
    const email = currentEmails.find(e => e.id === emailId);
    if (!email) return;
    
    const isExpanded = card.classList.contains("expanded");
    
    if (isExpanded) {
        // Collapse back to list row
        applyFilters();
    } else {
        // Expand card layout
        const cls = email.predicted_class;
        const isImportant = cls === "important";
        const isJunk = cls === "junk";
        const isChecked = document.getElementById(`check-${email.id}`).checked;
        const starChar = isImportant ? "★" : "☆";
        const starClass = isImportant ? "starred" : "";
        
        card.className = "email-card expanded selected";
        card.innerHTML = `
            <div class="expanded-header-row">
                <input type="checkbox" id="check-${email.id}" class="checkbox-custom" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
                <div class="star-btn ${starClass}" onclick="toggleStar(event, '${email.id}')">${ starChar}</div>
                <div class="expanded-subject">${escapeHtml(email.subject)}</div>
                <button class="icon-btn" style="margin-left:auto;" onclick="applyFilters()" title="Close details">✕</button>
            </div>
            
            <div class="expanded-details-container">
                <div class="expanded-meta">
                    <div>
                        <strong>From:</strong> ${escapeHtml(email.from)}
                    </div>
                    <div>
                        <strong>Date:</strong> ${escapeHtml(email.date)}
                    </div>
                </div>
                
                <div class="expanded-body">${escapeHtml(email.body || '(No body contents)')}</div>
                
                <div class="expanded-actions">
                    <div class="label-dropdown-container">
                        <span>Classification label:</span>
                        <select onchange="updateEmailLabel('${email.id}', this.value)">
                            <option value="none" ${cls === 'none' ? 'selected' : ''}>— No label —</option>
                            <option value="important" ${isImportant ? 'selected' : ''}>Important</option>
                            <option value="junk" ${isJunk ? 'selected' : ''}>Junk</option>
                        </select>
                    </div>
                    <button class="btn btn-accent" style="height:30px; font-size:0.8rem; padding:0 12px; border-radius:100px; box-shadow:none;" onclick="applyFilters()">Close Preview</button>
                </div>
            </div>
        `;
        
        // Re-bind checkbox change
        const checkbox = document.getElementById(`check-${email.id}`);
        checkbox.addEventListener("change", () => {
            updateSelectionCounters();
        });
    }
};

// Sync Manual Dropdown Override back to Gmail
window.updateEmailLabel = async function(emailId, newClass) {
    if (!activeAccount || !accounts[activeAccount]) {
        showToast("No active account. Please sign in.", "danger");
        return;
    }
    
    showLoader(`Syncing label "${newClass}" to Gmail...`);

    try {
        const res = await fetch("/api/update_label", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                credentials: accounts[activeAccount],
                email_id: emailId,
                new_class: newClass
            })
        });

        const data = await res.json();
        
        if (!res.ok) {
            const errMsg = data?.detail || res.statusText;
            throw new Error(errMsg);
        }
        
        console.log(`[updateEmailLabel] email=${emailId} new_class=${newClass} server_labels=`, data.labels);
        
        // Update local object class state
        const emailIdx = currentEmails.findIndex(e => e.id === emailId);
        if (emailIdx > -1) {
            currentEmails[emailIdx].predicted_class = newClass;
        }

        // Re-render the list
        applyFilters();
        
        showToast(
            newClass === "junk" 
                ? "✅ Moved to Junk in Gmail."
                : newClass === "important"
                    ? "✅ Marked as Important in Gmail."
                    : "✅ Label removed.",
            "success"
        );
    } catch (e) {
        console.error("Gmail label sync failed:", e);
        showToast(`❌ Failed to sync label: ${e.message}`, "danger");
    } finally {
        hideLoader();
    }
};

// Selection Counters
function updateSelectionCounters() {
    const checkedBoxes = emailList.querySelectorAll('input[type="checkbox"]:checked');
    const totalCount = filteredEmails.length;
    const checkedCount = checkedBoxes.length;

    selectionCounter.textContent = `Selected ${checkedCount} of ${totalCount}`;
    summarizeBtn.disabled = (checkedCount === 0);
    
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = totalCount > 0 && checkedCount === totalCount;
    }
}

// Generate AI Summary
async function generateSummary() {
    // Gather all selected emails
    const selectedIds = Array.from(emailList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(input => input.id.replace("check-", ""));
        
    const selectedEmails = currentEmails.filter(email => selectedIds.includes(email.id));

    if (selectedEmails.length === 0) {
        showToast("Please select at least one email.", "danger");
        return;
    }

    showLoader("Generating summary using AI...");

    try {
        const payload = {
            emails: selectedEmails
        };


        const res = await fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
        }

        const data = await res.json();
        
        // Render Markdown summary
        summaryContent.className = "summary-container";
        summaryContent.innerHTML = parseMarkdown(data.summary);
        
        // Auto-expand Right Summary panel if collapsed
        if (rightPanel && rightPanel.classList.contains("closed")) {
            rightPanel.classList.remove("closed");
            rightPanel.classList.add("open");
            if (toggleSummaryBtn) toggleSummaryBtn.classList.add("active");
        }

        showToast("AI Summary generated successfully!", "success");
    } catch (e) {
        console.error("Summarization error:", e);
        showToast("Failed to compile AI summary. Check your API keys.", "danger");
    } finally {
        hideLoader();
    }
}

// Simple Markdown Parser (H2, Lists, Bold)
function parseMarkdown(md) {
    if (!md) return "";
    
    let html = md;
    
    // Parse Headers: ## [Header]
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    
    // Parse Bold: **[Text]** or *[Text]*
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
    
    // Parse Bullet lists
    // Simple line by line replacement
    const lines = html.split("\n");
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("- ") || line.startsWith("* ")) {
            let itemText = line.substring(2);
            if (!inList) {
                lines[i] = "<ul><li>" + itemText + "</li>";
                inList = true;
            } else {
                lines[i] = "<li>" + itemText + "</li>";
            }
        } else {
            if (inList) {
                lines[i-1] = lines[i-1] + "</ul>";
                inList = false;
            }
        }
    }
    
    if (inList) {
        lines[lines.length - 1] = lines[lines.length - 1] + "</ul>";
    }
    
    return lines.join("\n");
}

// Loader Utilities
function showLoader(msg) {
    loaderMsg.textContent = msg;
    loader.classList.remove("hidden");
}

// Hide Loader
function hideLoader() {
    loader.classList.add("hidden");
}

// Toast Notifications
function showToast(msg, type = "success") {
    toast.textContent = msg;
    
    if (type === "success") {
        toast.style.borderLeft = "5px solid #137333";
    } else {
        toast.style.borderLeft = "5px solid #c5221f";
    }
    
    toast.classList.remove("hidden");
    
    setTimeout(() => {
        toast.classList.add("hidden");
    }, 4500);
}

// Helper to escape HTML characters (prevents XSS)
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
