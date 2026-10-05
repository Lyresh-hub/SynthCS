import type { TourStep } from "./OnboardingTour";

// Walkthrough of the Instructor Dashboard. Each step opens the tab it explains
// and highlights that tab's button (data-tour="tab-<id>" in InstructorDashboard).
export type InstructorTab = "pending" | "flagged" | "activity" | "students" | "invites" | "prompts" | "restrictions";

export function instructorTourSteps(openTab: (t: InstructorTab) => void): TourStep[] {
  const tabStep = (tab: InstructorTab, title: string, description: string): TourStep => ({
    title, description, target: `[data-tour='tab-${tab}']`, placement: "bottom", onEnter: () => openTab(tab),
  });
  return [
    {
      title: "Welcome to the Instructor Portal!",
      description: "From here you manage your class: approve students, review flagged prompts, follow what your students do, and set the rules for your class. Here's a quick look at each tab.",
      target: null,
      onEnter: () => openTab("pending"),
    },
    tabStep("pending", "Approvals",
      "Students who sign up for your class or use your invite link wait here. Approve them to give access, or reject them. The number shows how many are waiting."),
    tabStep("flagged", "Flagged Prompts",
      "When a student's search or AI description uses a trigger word, or the AI detects harmful intent, it waits here for your decision. The student's dataset stays locked until you approve. Rejecting adds a strike — 3 strikes ban the account."),
    tabStep("activity", "Activity Timeline",
      "Everything your enrolled students do: logins, searches, generations, downloads and errors, marked INFO, WARNING or ERROR. Filter by level, category, time or student, and use Download CSV to save it."),
    tabStep("students", "Students",
      "Everyone enrolled in your class, with their strikes and status. You can remove a student from your class here."),
    tabStep("invites", "Invite Links",
      "Create a class invite link (or send an email invitation) so students can join your class. You can switch a link off or delete it at any time."),
    tabStep("prompts", "Prompts & Reviews",
      "Every prompt your students made, with the reason they gave (category and purpose), whether it was flagged, your decision, and what came of it — datasets generated, downloaded or saved. Use the filters to find a student or type of data."),
    tabStep("restrictions", "Restrictions",
      "The rules for your class: your own trigger words (flag for review, or block outright), allowed data categories and purposes, the daily generation quota, and a box to test how a prompt would be treated."),
    {
      title: "You're all set!",
      description: "Start with Approvals to let your students in. You can replay this walkthrough anytime with the \"Take a Tour\" button at the top.",
      target: "[data-tour='instructor-tour-button']",
      placement: "bottom",
      onEnter: () => openTab("pending"),
    },
  ];
}
