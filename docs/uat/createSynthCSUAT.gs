/**
 * SynthCS — User Acceptance Testing (UAT) form
 * --------------------------------------------
 * Paste this into Google Apps Script (script.google.com → New project), then run
 * createSynthCSUAT(). The respondent and edit links are printed in the log
 * (View → Logs / Execution log).
 *
 * Structure
 *   1. Tester information + which account(s) they will test
 *   2. Student test cases        (TC-ST-01 … 12)
 *   3. Instructor test cases     (TC-IN-01 … 07)
 *   4. Administrator test cases  (TC-AD-01 … 05)
 *   5. General test cases        (TC-GN-01 … 03) — everyone
 *   6. Ratings + overall acceptance decision
 * Testers who choose one role are taken straight to that section, then to the
 * general tests. "All roles" goes through every section in order.
 */
function createSynthCSUAT() {
  const form = FormApp.create("SynthCS - User Acceptance Testing (UAT)");

  form.setDescription(
    "Evaluate SynthCS, the synthetic dataset generator for Gordon College. " +
    "Use the test account(s) given to you by the researchers (do not create your own). " +
    "Complete each test case in order: do the task in SynthCS (https://synthcs.site), " +
    "describe what actually happened, then select Pass, Fail or Not Applicable. " +
    "Submit only once, after finishing all the sections for your role(s)."
  );
  form.setProgressBar(true);
  form.setConfirmationMessage("Thank you! Your complete UAT evaluation has been submitted.");

  // ── PAGE 1: TESTER INFORMATION ────────────────────────────────────────────
  form.addTextItem().setTitle("Tester Name or Participant ID").setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle("Tester Role")
    .setChoiceValues(["Student", "Faculty Member / Instructor", "Technical Evaluator", "Domain Expert", "Other"])
    .setRequired(true);

  form.addDateItem().setTitle("Date of Testing").setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle("Device used")
    .setChoiceValues(["Laptop / Desktop", "Phone", "Tablet"])
    .setRequired(true);

  form.addTextItem()
    .setTitle("Browser used")
    .setHelpText("For example: Chrome, Edge, Safari, Firefox");

  // Navigation is set at the end, after the section pages exist
  const accountChoice = form.addMultipleChoiceItem()
    .setTitle("Which SynthCS account(s) will you test?")
    .setHelpText("You will be taken to the test cases for that account. Choose \"All roles\" if you were given all three test accounts.")
    .setRequired(true);

  // ── TEST CASES ────────────────────────────────────────────────────────────
  const studentTests = [
    {
      id: "TC-ST-01", name: "Sign In and Walkthrough (Student)",
      task: "Go to synthcs.site, click Sign in and log in with the student test account. Follow the walkthrough that appears the first time.",
      expected: "The student dashboard opens and the guided walkthrough explains the main pages (Dashboard, Schema Builder, Downloads, Saved Schemas)."
    },
    {
      id: "TC-ST-02", name: "Dataset Search",
      task: "Open Schema Builder. Search for a topic (e.g. \"student performance\"). Answer the questions about the type of data and your purpose.",
      expected: "Real datasets are listed from the available sources (e.g. Kaggle, Hugging Face, UCI, OpenML), with their size and source. More results can be shown."
    },
    {
      id: "TC-ST-03", name: "AI Schema Generation",
      task: "In Schema Builder, under \"Describe Your Dataset\", type a description (e.g. \"student grades and attendance for a statistics class\") and click Generate Schema.",
      expected: "A schema with suitable column names, data types and value ranges is created and shown in the editor."
    },
    {
      id: "TC-ST-04", name: "Schema Editing and Saving",
      task: "Rename a column, change a data type and adjust a value range. Save the schema, then open Saved Schemas.",
      expected: "The changes are kept, the schema is saved, and it appears in Saved Schemas where it can be loaded again."
    },
    {
      id: "TC-ST-05", name: "Upload Own Dataset",
      task: "Upload a small CSV or Excel file of your own. Then try an invalid file (e.g. an empty file or an image renamed to .csv).",
      expected: "Valid files: the columns and their types are detected. Invalid files: a clear message explains the problem (no crash)."
    },
    {
      id: "TC-ST-06", name: "Synthetic Dataset Generation",
      task: "Using a real dataset (searched or uploaded) or an AI schema, set a row count (e.g. 1,000) and generate the synthetic dataset.",
      expected: "Generation finishes with the requested number of rows; the columns follow the schema and the values look realistic (no impossible values such as negative ages)."
    },
    {
      id: "TC-ST-07", name: "Preview and Export",
      task: "Open the Preview of the generated dataset. Check the Table View, JSON and Statistics tabs. Export it as CSV and as one other format (JSON, SQL or XLSX).",
      expected: "The data is shown correctly in each tab and the exported files download and open properly."
    },
    {
      id: "TC-ST-08", name: "My Downloads and Validation Report",
      task: "Open My Downloads, find the dataset, and open its Validation Report (if available for that dataset).",
      expected: "The dataset is listed with its details. The report shows the quality metrics (e.g. statistical fidelity, correlation, machine-learning utility, privacy risk)."
    },
    {
      id: "TC-ST-09", name: "Flagged Prompt and My Requests",
      task: "Search or describe a dataset using a sensitive word (e.g. \"credit card fraud records\"). Then open My Requests.",
      expected: "The system says the prompt was sent to the instructor for review; any dataset made from it stays locked; My Requests shows it as Pending (and later the instructor's decision)."
    },
    {
      id: "TC-ST-10", name: "Daily Generation Limit",
      task: "If the instructor set a daily limit for the class, generate until the limit is reached. (Select Not Applicable if no limit was set.)",
      expected: "When the limit is reached, generating is refused with a message that says when the limit resets."
    },
    {
      id: "TC-ST-11", name: "Account Settings and Privacy Mode",
      task: "Open Account Settings. Turn on Privacy Mode, then change your password and log in again with the new password.",
      expected: "Privacy Mode is saved (new datasets are deleted after 24 hours instead of 30 days) and the new password works."
    },
    {
      id: "TC-ST-12", name: "API Access",
      task: "Open the API Access page and follow the documented steps with valid credentials, if this feature is enabled. (Select Not Applicable if it is not available.)",
      expected: "The API returns the expected response for a valid request."
    }
  ];

  const instructorTests = [
    {
      id: "TC-IN-01", name: "Sign In and Walkthrough (Instructor)",
      task: "Log in with the instructor test account and follow the walkthrough. Use \"Take a Tour\" to replay it.",
      expected: "The Instructor Dashboard opens; the walkthrough opens each tab and explains it."
    },
    {
      id: "TC-IN-02", name: "Student Approvals",
      task: "Open the Approvals tab. Approve (or reject) a student who is waiting to join the class.",
      expected: "The student's status changes; an approved student can now use SynthCS and appears in the Students tab."
    },
    {
      id: "TC-IN-03", name: "Flagged Prompt Review",
      task: "Open Flagged Prompts. Read why a prompt was flagged, then Approve one and Reject another (if available).",
      expected: "Approving unlocks the student's dataset; rejecting adds a strike to the student (3 strikes ban the account). Decided prompts move to Prompts & Reviews."
    },
    {
      id: "TC-IN-04", name: "Activity Timeline",
      task: "Open Activity Timeline. Filter by level (Info, Warning, Error), category and time range, then click Download CSV.",
      expected: "The actions of your own students are listed with the time and level; the filters work; the CSV file opens in Excel."
    },
    {
      id: "TC-IN-05", name: "Prompts and Reviews",
      task: "Open Prompts & Reviews. Filter by student and status, and open one prompt for its details.",
      expected: "Each prompt shows the student, the reason given (category and purpose), whether it was flagged, the decision, and the result (datasets generated, downloaded or saved)."
    },
    {
      id: "TC-IN-06", name: "Class Invite Links",
      task: "Open Invite Links. Generate a link for your course, copy it, and switch it off and on again.",
      expected: "The link is created and copied. A student can create an account only while the link is active; a switched-off link is refused."
    },
    {
      id: "TC-IN-07", name: "Class Restrictions",
      task: "Open Restrictions. Add your own trigger word (Flag or Block), choose allowed data categories, set a daily generation limit, and test a prompt with \"Test a prompt\".",
      expected: "The settings are saved and applied to your students; \"Test a prompt\" shows whether a prompt would be flagged, blocked, or allowed, and why."
    }
  ];

  const adminTests = [
    {
      id: "TC-AD-01", name: "Sign In and Walkthrough (Administrator)",
      task: "Log in with the administrator test account and follow the walkthrough.",
      expected: "The Admin Portal opens; the walkthrough goes through Overview, User Management, Classes and Activity History."
    },
    {
      id: "TC-AD-02", name: "Overview and Usage Numbers",
      task: "On the Overview page, check the totals and the Usage section. Switch between the last 7, 30 and 90 days.",
      expected: "The totals and the usage numbers (datasets generated per day, active users, flagged prompts, errors, top categories) are shown and change with the selected period."
    },
    {
      id: "TC-AD-03", name: "User Management",
      task: "Search for a user. Try the available account actions (e.g. verify, reset strikes, ban and unban a test account, register an instructor).",
      expected: "Each action takes effect immediately and is recorded in Activity History."
    },
    {
      id: "TC-AD-04", name: "Instructor Invite Link",
      task: "Open Classes → Instructor Invites. Create a link for a course and open it in a private/incognito window.",
      expected: "The link opens the instructor sign-up page showing the assigned course. After sign-up, the new instructor has that course; the link cannot be used a second time."
    },
    {
      id: "TC-AD-05", name: "Activity History",
      task: "Open Activity History. Use the quick views (All activity, Logins & logouts, Faculty actions, Accounts & bans, System), the filters, and Download CSV.",
      expected: "The actions of all students and instructors are listed (the students' prompt text itself is not shown); the filters and CSV download work."
    }
  ];

  const generalTests = [
    {
      id: "TC-GN-01", name: "Invite-Only Account Creation",
      task: "Log out. On the Sign in page, look for a way to sign up without an invite link, and try opening the sign-up page directly.",
      expected: "There is no public sign-up: accounts can only be created with an instructor's class link (students) or an administrator's link (instructors)."
    },
    {
      id: "TC-GN-02", name: "Access Control and Logout",
      task: "While logged in as a student, try to open the instructor or admin pages. Then log out and press the browser's Back button.",
      expected: "Students cannot open instructor or admin pages. After logging out, the account's pages are no longer accessible without logging in again."
    },
    {
      id: "TC-GN-03", name: "Mobile Use",
      task: "Open SynthCS on a phone (or a narrow browser window) and use a few pages (e.g. Schema Builder, Preview, the instructor or admin pages).",
      expected: "Pages fit the screen; text and buttons do not overlap; menus can be opened and used."
    }
  ];

  // One page per test case: task + expected result, then the tester's answers
  function addTestPages(tests) {
    let firstPage = null;
    tests.forEach(function (test) {
      const page = form.addPageBreakItem()
        .setTitle(test.id + ": " + test.name)
        .setHelpText(
          "Task: " + test.task +
          "\n\nExpected result: " + test.expected +
          "\n\nPerform the task in SynthCS before answering."
        );
      if (!firstPage) firstPage = page;

      form.addParagraphTextItem()
        .setTitle("Actual Result")
        .setHelpText("Describe what actually happened. If the test does not apply, write N/A.")
        .setRequired(true);

      form.addMultipleChoiceItem()
        .setTitle("Test Status")
        .setChoiceValues(["Pass", "Fail", "Not Applicable"])
        .setRequired(true);

      form.addParagraphTextItem()
        .setTitle("Remarks / Performance Notes")
        .setHelpText("Errors, how long it took, unexpected behavior, or reasons for failure.");
    });
    return firstPage;
  }

  // ── SECTIONS ──────────────────────────────────────────────────────────────
  const studentStart = addTestPages(studentTests);
  const afterStudent = form.addMultipleChoiceItem()
    .setTitle("Next section")
    .setHelpText("Continue with the instructor tests only if you were given the instructor test account.")
    .setRequired(true);

  const instructorStart = addTestPages(instructorTests);
  const afterInstructor = form.addMultipleChoiceItem()
    .setTitle("Next section")
    .setHelpText("Continue with the administrator tests only if you were given the administrator test account.")
    .setRequired(true);

  const adminStart = addTestPages(adminTests);
  const generalStart = addTestPages(generalTests);   // admin section flows straight into this

  // ── FINAL PAGE: RATINGS AND ACCEPTANCE ───────────────────────────────────
  const finalPage = form.addPageBreakItem()
    .setTitle("Final Page: Ratings and Overall Acceptance");

  form.addGridItem()
    .setTitle("Rate SynthCS (1 = Strongly Disagree, 5 = Strongly Agree)")
    .setRows([
      "The system is easy to learn and use.",
      "The walkthroughs and on-screen messages are clear.",
      "The generated datasets are realistic and useful for my purpose.",
      "The system responds in an acceptable time.",
      "The flagging and review process works as intended.",
      "The system works well on the device I used."
    ])
    .setColumns(["1", "2", "3", "4", "5"])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle("Overall Acceptance Decision")
    .setChoiceValues(["Accepted", "Conditionally Accepted", "Rejected"])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("Overall Comments and Recommendations")
    .setRequired(true);

  // ── NAVIGATION (branching by the accounts being tested) ──────────────────
  accountChoice.setChoices([
    accountChoice.createChoice("Student account only", studentStart),
    accountChoice.createChoice("Instructor account only", instructorStart),
    accountChoice.createChoice("Administrator account only", adminStart),
    accountChoice.createChoice("All roles (student, instructor and administrator)", studentStart)
  ]);
  afterStudent.setChoices([
    afterStudent.createChoice("Continue to the instructor tests", instructorStart),
    afterStudent.createChoice("Skip to the general tests", generalStart)
  ]);
  afterInstructor.setChoices([
    afterInstructor.createChoice("Continue to the administrator tests", adminStart),
    afterInstructor.createChoice("Skip to the general tests", generalStart)
  ]);

  Logger.log("FORM CREATED SUCCESSFULLY");
  Logger.log("Respondent Link: " + form.getPublishedUrl());
  Logger.log("Edit Link: " + form.getEditUrl());
}
