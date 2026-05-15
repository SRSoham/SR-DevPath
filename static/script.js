// script.js — DevPath client-side logic
//
// Responsibilities:
//   - Mobile navigation toggle
//   - Skill chip manager (add/remove skills)
//   - Form validation with per-field error messages
//   - Recommendation API call and loading states
//   - Result card rendering
//   - Code viewer panel (detail page)

// ============================================================
// Detect which page we are on
// ============================================================
var isIndexPage  = !!document.getElementById("recommend-form"); // !! converts whatever getElementById returns into true/false if(element) exists then index page, otherwise not
var isDetailPage = typeof PROJECT_ID !== "undefined"; // PROJECT_ID is a variable set in the detail page's HTML, if exists then detail page


// ============================================================
// Mobile navigation toggle (runs on all pages)
// ============================================================
(function initMobileNav() {
  var toggle = document.getElementById("nav-mobile-toggle"); //hamburger button
  var menu   = document.getElementById("nav-mobile-menu"); //dropdown menu 

  if (!toggle || !menu) return; //if either element is missing, abort

  toggle.addEventListener("click", function () { 
    //classList.toggle("open") adds "open" if not present, removes if present, and returns true/false so we can use that value for aria-expanded
    var isOpen = menu.classList.toggle("open");
    toggle.classList.toggle("open", isOpen);
    toggle.setAttribute("aria-expanded", isOpen); //aria-expanded is for accessibility, indicates whether the menu is open or closed
  });

  // Close menu when any mobile link is clicked
  menu.querySelectorAll(".nav-mobile-link").forEach(function (link) { 
    link.addEventListener("click", function () { 
      menu.classList.remove("open"); 
      toggle.classList.remove("open");
    });
  });
})();


// ============================================================
// INDEX PAGE
// ============================================================
if (isIndexPage) {

  // DOM references
  // grabbing all the elements we'll need so we're not calling getElementById over and over again throughout the code
  var form              = document.getElementById("recommend-form");
  var submitBtn         = document.getElementById("submit-btn");
  var btnLabel          = document.getElementById("btn-label"); // "get recommendations" text 
  var btnLoading        = document.getElementById("btn-loading"); // spinner icon inside the button 
  var resultsSection    = document.getElementById("results-section"); 
  var resultsGrid       = document.getElementById("results-grid"); 
  var resultsLoadingEl  = document.getElementById("results-loading"); // "Loading..." text in the results 
  var resultsEmptyEl    = document.getElementById("results-empty"); 
  var emptyMessageEl    = document.getElementById("empty-message"); 
  var skillsHidden      = document.getElementById("skills"); // the hidden input that holds skills list
  var skillsTextInput   = document.getElementById("skills-input"); //visible text box in which user types skills
  var chipsSelectedEl   = document.getElementById("skill-chips-selected"); //selected skills tags container
  var quickPickChips    = document.querySelectorAll(".skill-chip"); // predefined skills user can click

  // Tracks currently selected skills to prevent duplicates
  var selectedSkills = [];


  // ----------------------------------------------------------
  // Skill chip manager
  // ----------------------------------------------------------

  // Add skill on Enter key in the text input
  // when the user types a skill and hits Enter, add it we intercept Enter here so it doesn't accidentally submit the whole form
  skillsTextInput.addEventListener("keydown", function (evt) {
    if (evt.key === "Enter") {
      evt.preventDefault(); // prevent form submission
      var value = skillsTextInput.value.trim();
      if (value) {
        addSkill(value);
        skillsTextInput.value = ""; // clear input after adding
      }
    }
  });

  // Add skill on quick-pick chip click (predefined popular skills)
  quickPickChips.forEach(function (chip) {
    chip.addEventListener("click", function () { 
      addSkill(chip.getAttribute("data-skill")); //data-skill is a HTML attribute that holds skill name 
      chip.classList.add("active");
    });
  });

  // Focus the text input when clicking anywhere in the chip wrap
  var skillWrap = document.getElementById("skill-input-wrap");
  if (skillWrap) {
    skillWrap.addEventListener("click", function () { skillsTextInput.focus(); });
  }

  //add a skill to the list if it's not empty or a duplicate
  function addSkill(rawSkill) {
    var skill = rawSkill.trim(); //remove extra space from start/end
    if (!skill) return; // skip empty skills

    // Block duplicate entries (case-insensitive) ("react" and "React" and "REACT" all count as the same thing)
    var isDuplicate = selectedSkills.some(function (s) {
      return s.toLowerCase() === skill.toLowerCase();
    });
    if (isDuplicate) return; // skip duplicates

    selectedSkills.push(skill);
    renderSelectedChips(); // update the UI to show the new skill as a chip/tag
    syncSkillsHiddenInput(); // update the hidden input's value with the updated skills
    clearFieldError("skills-error"); // clear any error msgs
  }

  // remove a skill from the list and update the UI accordingly
  function removeSkill(skill) {
    selectedSkills = selectedSkills.filter(function (s) { return s !== skill; }); //filter returns new array with all skills except the skill we are removing
    renderSelectedChips();
    syncSkillsHiddenInput();

    // Un-highlight the quick-pick button if it matches the removed skill
    quickPickChips.forEach(function (chip) {
      if (chip.getAttribute("data-skill") === skill) {
        chip.classList.remove("active");
      }
    });
  }

  // recreate the selected skills chips based on the current array(selectedSkills)
  // called every time we add or remove a skill
  function renderSelectedChips() {
    chipsSelectedEl.innerHTML = ""; //clear existing chips first
    selectedSkills.forEach(function (skill) {
      // Create a new chip element for each selected skill
      var chipEl = document.createElement("span");
      chipEl.className = "skill-chip-selected";
      chipEl.textContent = skill;

      // Remove button for each chip (create lil "x" button)
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "skill-chip-remove";
      removeBtn.innerHTML = "&times;"; //'x' symbol
      removeBtn.setAttribute("aria-label", "Remove " + skill); 
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation(); // prevent triggering any parent click handlers
        removeSkill(skill);
      });

      chipEl.appendChild(removeBtn); // put x button inside the chip
      chipsSelectedEl.appendChild(chipEl); //add chip to page
    });
  }

  function syncSkillsHiddenInput() {
    // Keep the hidden <input> in sync with the selectedSkills array
    skillsHidden.value = selectedSkills.join(", ");
  }


  // ----------------------------------------------------------
  // Form validation
  // ----------------------------------------------------------

  //puts error msg under specific field
  function showFieldError(fieldId, message) {
    var el = document.getElementById(fieldId);
    if (el) el.textContent = message;
  }

  //clears error msg under specific field
  function clearFieldError(fieldId) {
    var el = document.getElementById(fieldId);
    if (el) el.textContent = ""; //empty string = no error msg
  }

  //clears all error msgs in the form, called at the start of form submission to reset any previous errors
  function clearAllErrors() {
    ["skills-error", "level-error", "interest-error", "time-error"].forEach(clearFieldError);
    var generalErr = document.getElementById("form-error-general");
    if (generalErr) generalErr.textContent = "";
  }

  // checks form fields and shows error messages if any required field is missing or invalid. 
  // Returns true if the form is valid, false otherwise
  function validateForm() {
    var valid = true;

    // check skills 
    if (selectedSkills.length === 0 && !skillsHidden.value.trim()) {
      showFieldError("skills-error", "Please add at least one skill.");
      valid = false;
    }
    if (!document.getElementById("level").value) {
      showFieldError("level-error", "Please select your experience level.");
      valid = false;
    }
    if (!document.getElementById("interest").value) {
      showFieldError("interest-error", "Please select an area of interest.");
      valid = false;
    }
    if (!document.getElementById("time").value) {
      showFieldError("time-error", "Please select your time availability.");
      valid = false;
    }

    return valid;
  }


  // ----------------------------------------------------------
  // Form submission and API call
  // ----------------------------------------------------------

  form.addEventListener("submit", function (evt) {
    evt.preventDefault(); //stop the browser from reloading the page on form submit
    clearAllErrors();

    if (!validateForm()) return; //stop - anything missing/invalid

    setLoadingState(true);

    //combine form values into an object to send to server/api
    var payload = {
      skills:   skillsHidden.value.trim() || skillsTextInput.value.trim(), //hidden input or text input(skill isnt entered as chip
      level:    document.getElementById("level").value,
      interest: document.getElementById("interest").value,
      time:     document.getElementById("time").value
    };

    //post the data to backend api as JSON, then handle the response
    fetch("/api/recommend", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload) //convert object to json string
    })
      .then(function (res) { return res.json(); }) //parse the response as JSON
      .then(function (data) {
        setLoadingState(false);

        //the api can send back an error msg instead of results
        if (data.error) {
          var generalErr = document.getElementById("form-error-general");
          if (generalErr) generalErr.textContent = data.error;
          return;
        }

        //data.projects is the array of recommended projects, data.message is an optional message from the API (e.g. "No projects found matching your criteria.")
        renderResults(data.projects || [], data.message);
      })
      .catch(function (err) {
        // this runs if the network request itself fails 
        setLoadingState(false);
        var generalErr = document.getElementById("form-error-general");
        if (generalErr) generalErr.textContent = "Something went wrong. Please try again.";
        console.error("API request failed:", err);
      });
  });

  // Manages the loading state of the form and results section(whats visible or not)
  function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading; //grey out button while loading
    // Swap button text with loading spinner
    btnLabel.style.display   = isLoading ? "none"   : "inline";
    btnLoading.style.display = isLoading ? "inline" : "none";

    if (isLoading) {
      // Show the results section with only the loading indicator visible(other things are hidden)
      resultsSection.style.display    = "block";
      resultsLoadingEl.style.display  = "block";
      resultsGrid.style.display       = "none";
      resultsEmptyEl.style.display    = "none";
      resultsSection.scrollIntoView({ behavior: "smooth" }); // scroll down so user can see the loading spinner
    } else {
      resultsLoadingEl.style.display  = "none";
      resultsGrid.style.display       = "grid"; //switch back to gird layout 
    }
  }


  // ----------------------------------------------------------
  // Render result cards
  // ----------------------------------------------------------

  //takes the array of projects from the api and draws them on the page as cards
  //if array is empty it shows the "no results" message instead
  function renderResults(projects, message) {
    resultsSection.style.display    = "block";
    resultsLoadingEl.style.display  = "none";
    resultsGrid.innerHTML           = "";

    if (!projects || projects.length === 0) { //if no projects returned from api, show the "no results" message and hide the grid
      resultsGrid.style.display      = "none";
      resultsEmptyEl.style.display   = "block";
      if (message && emptyMessageEl) emptyMessageEl.textContent = message; //if api sent back a message (e.g. "no projects found matching your criteria"), show that 
      return;
    }

    resultsEmptyEl.style.display  = "none";
    resultsGrid.style.display     = "grid";

    //build a card for each project and add it to the grid
    projects.forEach(function (project) {
      resultsGrid.appendChild(buildProjectCard(project));
    });

    resultsSection.scrollIntoView({ behavior: "smooth" });
  }

  // builds one project card as a DOM element and returns it
  // the card has title, short description, tags and link
  function buildProjectCard(project) {
    var card = document.createElement("div");
    card.className = "project-card";

    // Title
    var title = document.createElement("h3");
    title.className   = "project-card-title";
    title.textContent = project.title;

    // Description (truncated for visual consistency)
    var desc = document.createElement("p");
    desc.className   = "project-card-desc";
    desc.textContent = truncate(project.description, 120);

    // Tags row
    var tagsRow = document.createElement("div");
    tagsRow.className = "project-card-tags";

    // Show the first two skills as tags
    (project.skills || []).slice(0, 2).forEach(function (skill) {
      tagsRow.appendChild(createTag(skill, "skill"));
    });

    // Level tag (colour-coded via CSS class)
    var levelClass = "level " + (project.level || "").toLowerCase();
    tagsRow.appendChild(createTag(project.level, levelClass));

    // Time tag
    tagsRow.appendChild(createTag("Time: " + project.time, "time"));

    // Footer with view-details link
    var footer = document.createElement("div");
    footer.className = "project-card-footer";

    var link = document.createElement("a");
    link.className   = "btn-details";
    link.textContent = "View Full Project";
    link.href        = "/project/" + project.id; //each project has a unique id

    footer.appendChild(link);

    // Assemble the card in order
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(tagsRow);
    card.appendChild(footer);

    return card;
  }

  // helper to create a coloured tag element (used for skills, level, time tags on the cards)
  function createTag(text, type) {
    var span = document.createElement("span");
    span.className   = "project-tag project-tag--" + type;
    span.textContent = text;
    return span;
  }

  function truncate(text, maxLength) {
    if (!text) return "";
    return text.length > maxLength ? text.slice(0, maxLength) + "..." : text; //if text is longer than maxLength, cut it and add "..." at the end, otherwise return the original text
  }

} // end isIndexPage


// ============================================================
// DETAIL PAGE
// ============================================================
if (isDetailPage) {

  var codePanel         = document.getElementById("code-panel"); // sliding panel that shows the starter code "
  var codePanelOverlay  = document.getElementById("code-panel-overlay"); // background overlay 
  var codeContentEl     = document.getElementById("code-content"); // <pre> element inside the panel where the code will be inserted
  var codePanelFilename = document.getElementById("code-panel-filename"); // filename display
  var btnViewCode       = document.getElementById("btn-view-code"); // button to open the code panel on desktop
  var btnViewCodeSm     = document.getElementById("btn-view-code-sm"); // button to open the code panel on mobile (could be the same button with different styling, but we have two here for simplicity)
  var btnClosePanel     = document.getElementById("code-panel-close"); // button inside the panel to close it

  // Cache flag so code is only fetched once per page load
  var codeFetched = false;

  //opens the sliding code panel 
  function openCodePanel() {
    if (!codePanel) return;
    codePanel.classList.add("active");
    if (codePanelOverlay) codePanelOverlay.classList.add("active"); // show the background overlay
    document.body.style.overflow = "hidden"; // prevent background scrolling when panel is open

    if (!codeFetched) fetchStarterCode(); // only fetch the code from server one time - after that code is already in the DOM
  }

  //closes the code panel and hides the overlay
  function closeCodePanel() {
    if (!codePanel) return;
    codePanel.classList.remove("active");
    if (codePanelOverlay) codePanelOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  //fetches the starter code from the server via an API call
  //inserts the code into the panel and handles loading/error states
  function fetchStarterCode() {
    if (codeContentEl) codeContentEl.textContent = "Loading starter code...";

    fetch("/project/" + PROJECT_ID + "/code")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          if (codeContentEl) codeContentEl.textContent = "Error: " + data.error;
          return;
        }
        if (codePanelFilename) codePanelFilename.textContent = data.filename; //show the filename at the top of the panel
        if (codeContentEl)     codeContentEl.textContent     = data.code; //insert the code into the <pre> element in the panel
        codeFetched = true; //mark as loaded so we dont fetch again next time the panel opens
      })
      .catch(function () {
        if (codeContentEl) {
          codeContentEl.textContent = "Could not load starter code. Try downloading it instead.";
        }
      });
  }

  // Attach open handlers for desktop and mobile code-view buttons
  if (btnViewCode)   btnViewCode.addEventListener("click", openCodePanel);
  if (btnViewCodeSm) btnViewCodeSm.addEventListener("click", openCodePanel);
  if (btnClosePanel) btnClosePanel.addEventListener("click", closeCodePanel);

  if (codePanelOverlay) {
    codePanelOverlay.addEventListener("click", closeCodePanel); //clicking on the background overlay to also close the panel
  }

  document.addEventListener("keydown", function (evt) {
    if (evt.key === "Escape") closeCodePanel(); //esc key to close
  });

  // ----------------------------------------------------------
  // Copy Code button
  // ----------------------------------------------------------
  var btnCopyCode  = document.getElementById("btn-copy-code");
  var copyToast    = document.getElementById("copy-toast"); //popup msg when copied 
  var toastTimeout = null; 

  //shows the "copied to clipboard" state on the button and the toast message, then resets after a short delay
  function showCopySuccess() {
    if (!btnCopyCode) return;

    // Swap icons on the button(copy and checkmark icons)
    var copyIcon  = btnCopyCode.querySelector(".copy-icon");
    var checkIcon = btnCopyCode.querySelector(".check-icon");
    var btnLabel  = btnCopyCode.querySelector(".copy-btn-label");

    if (copyIcon)  copyIcon.style.display  = "none";
    if (checkIcon) checkIcon.style.display = "inline";
    if (btnLabel)  btnLabel.textContent    = "Copied!";
    btnCopyCode.classList.add("copied");
    btnCopyCode.disabled = true; //prevent multiple clicks while in copied state

    // Show toast
    if (copyToast) {
      copyToast.classList.add("show");
    }

    // Auto-reset after 2.5 s
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      if (copyIcon)  copyIcon.style.display  = "inline";
      if (checkIcon) checkIcon.style.display = "none";
      if (btnLabel)  btnLabel.textContent    = "Copy Code";
      btnCopyCode.classList.remove("copied");
      btnCopyCode.disabled = false;
      if (copyToast) copyToast.classList.remove("show");
    }, 2500);
  }

  if (btnCopyCode) {
    btnCopyCode.addEventListener("click", function () {
      var code = codeContentEl ? codeContentEl.textContent : "";
      // Don't attempt to copy if code is empty or still loading
      if (!code || code === "Loading..." || code === "Loading starter code...") return;

      // Use Clipboard API with textarea fallback
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(showCopySuccess).catch(function () {
          fallbackCopy(code); // clipboard api failed, try the old way
        });
      } else {
        fallbackCopy(code); // Clipboard API not supported, use fallback method
      }
    });
  }

  // Fallback method to copy text using a hidden textarea and execCommand (for older browsers)
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); // focus the textarea so that execCommand can work
    ta.select(); // select the text inside the textarea
    try { document.execCommand("copy"); showCopySuccess(); } catch (e) { /* silent fail */ } // execCommand can throw an error if it fails
    document.body.removeChild(ta); // clean up the DOM by removing the textarea after copying
  }

} // end isDetailPage
