/**
 * SynthCS — System Usability Scale (SUS) questionnaire (Google Form)
 * -----------------------------------------------------------------
 * The standard 10-item SUS from the Thesis Project Evaluation Guide. Give it to
 * each participant right after their UAT tasks (Step 5 of the guide).
 *
 * Paste into Google Apps Script (script.google.com → New project) and run
 * createSynthCSSUS(). The respondent and edit links appear in the Execution log.
 *
 * Scoring: copy each respondent's 10 ratings into SynthCS_SUS_Calculator.xlsx
 * (odd items: rating − 1; even items: 5 − rating; SUS = sum × 2.5).
 */
function createSynthCSSUS() {
  const form = FormApp.create("SynthCS - System Usability Scale (SUS)");

  form.setDescription(
    "Thank you for participating in our evaluation. Please complete this questionnaire after finishing " +
    "your User Acceptance Testing (UAT) tasks in SynthCS. For each statement, choose the ONE rating (1 to 5) " +
    "that best reflects your immediate reaction. Answer based on your first instinct. Respond to all " +
    "statements — do not leave any blank. If you are unsure, choose 3 (Neutral)."
  );
  form.setProgressBar(true);
  form.setConfirmationMessage("Thank you! Your SUS questionnaire has been submitted.");

  // Participant information
  form.addTextItem().setTitle("Participant Name").setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle("Role")
    .setChoiceValues(["Student", "Instructor", "Administrator", "Domain Expert", "Technical Evaluator", "Other"])
    .setRequired(true);
  form.addDateItem().setTitle("Date").setRequired(true);

  // The 10 SUS statements (fixed order and wording — do not change)
  const statements = [
    "I think that I would like to use this system frequently.",
    "I found the system unnecessarily complex.",
    "I thought the system was easy to use.",
    "I think that I would need the support of a technical person to be able to use this system.",
    "I found the various functions in this system were well integrated.",
    "I thought there was too much inconsistency in this system.",
    "I would imagine that most people would learn to use this system very quickly.",
    "I found the system very cumbersome to use.",
    "I felt very confident using the system.",
    "I needed to learn a lot of things before I could get going with this system."
  ];

  form.addSectionHeaderItem()
    .setTitle("System Usability Scale")
    .setHelpText("1 = Strongly Disagree · 2 = Disagree · 3 = Neutral · 4 = Agree · 5 = Strongly Agree");

  statements.forEach(function (text, i) {
    form.addScaleItem()
      .setTitle((i + 1) + ". " + text)
      .setBounds(1, 5)
      .setLabels("Strongly Disagree", "Strongly Agree")
      .setRequired(true);
  });

  // Additional qualitative feedback (optional), as in the guide
  form.addSectionHeaderItem().setTitle("Additional Qualitative Feedback (Optional)");
  form.addParagraphTextItem().setTitle("What feature(s) did you find most useful or easiest to use?");
  form.addParagraphTextItem().setTitle("What difficulties or bugs did you encounter during the test?");

  Logger.log("FORM CREATED SUCCESSFULLY");
  Logger.log("Respondent Link: " + form.getPublishedUrl());
  Logger.log("Edit Link: " + form.getEditUrl());
}
