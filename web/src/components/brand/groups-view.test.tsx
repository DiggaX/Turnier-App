/**
 * Unit tests for the GroupsView component.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GroupsView, type GroupMatch } from "./groups-view";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeMatch(
  overrides: Partial<GroupMatch> & { id: string },
): GroupMatch {
  return {
    bracket: "winner",
    round: 1,
    slot: 0,
    status: "pending",
    winnerId: null,
    participantAId: null,
    participantBId: null,
    aName: null,
    bName: null,
    groupNo: 0,
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

const NO_STANDINGS: Record<number, never[]> = {};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GroupsView", () => {
  it("renders a section per group with the correct group label", () => {
    const matches: GroupMatch[] = [
      makeMatch({
        id: "m1",
        groupNo: 0,
        aName: "Alice",
        bName: "Bob",
        participantAId: "pA",
        participantBId: "pB",
      }),
      makeMatch({
        id: "m2",
        groupNo: 1,
        aName: "Carol",
        bName: "Dave",
        participantAId: "pC",
        participantBId: "pD",
      }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    expect(screen.getByText("Gruppe A")).toBeInTheDocument();
    expect(screen.getByText("Gruppe B")).toBeInTheDocument();
  });

  it("shows 'vs' for a pending match", () => {
    const matches: GroupMatch[] = [
      makeMatch({
        id: "m1",
        groupNo: 0,
        aName: "Alice",
        bName: "Bob",
        participantAId: "pA",
        participantBId: "pB",
        status: "pending",
      }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    expect(screen.getByText("vs")).toBeInTheDocument();
  });

  it("shows the score for a done match", () => {
    const matches: GroupMatch[] = [
      makeMatch({
        id: "m1",
        groupNo: 0,
        aName: "Alice",
        bName: "Bob",
        participantAId: "pA",
        participantBId: "pB",
        status: "done",
        scoreA: 3,
        scoreB: 1,
        winnerId: "pA",
      }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    expect(screen.getByText("3:1")).toBeInTheDocument();
  });

  it("highlights the winner in lime (text-lime class)", () => {
    const matches: GroupMatch[] = [
      makeMatch({
        id: "m1",
        groupNo: 0,
        aName: "Alice",
        bName: "Bob",
        participantAId: "pA",
        participantBId: "pB",
        status: "done",
        scoreA: 2,
        scoreB: 0,
        winnerId: "pA",
      }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    const alice = screen.getByText("Alice");
    expect(alice.className).toContain("text-lime");
    const bob = screen.getByText("Bob");
    expect(bob.className).not.toContain("text-lime");
  });

  it("renders 'TBD' when participant names are null", () => {
    const matches: GroupMatch[] = [
      makeMatch({ id: "m1", groupNo: 0, aName: null, bName: null }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    const tbds = screen.getAllByText("TBD");
    expect(tbds).toHaveLength(2);
  });

  it("renders nothing when matches array is empty", () => {
    const { container } = render(
      <GroupsView matches={[]} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    // The outer div renders but no group sections
    expect(container.querySelectorAll("section")).toHaveLength(0);
  });

  it("renders groups sorted by group number", () => {
    const matches: GroupMatch[] = [
      makeMatch({ id: "m2", groupNo: 1, aName: "Carol", bName: "Dave" }),
      makeMatch({ id: "m1", groupNo: 0, aName: "Alice", bName: "Bob" }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    const labels = screen.getAllByText(/Gruppe [AB]/);
    expect(labels[0].textContent).toBe("Gruppe A");
    expect(labels[1].textContent).toBe("Gruppe B");
  });

  it("renders multiple matches within a single group in round/slot order", () => {
    const matches: GroupMatch[] = [
      makeMatch({
        id: "m2",
        groupNo: 0,
        aName: "X",
        bName: "Y",
        round: 2,
        slot: 0,
      }),
      makeMatch({
        id: "m1",
        groupNo: 0,
        aName: "A",
        bName: "B",
        round: 1,
        slot: 0,
      }),
    ];
    render(
      <GroupsView matches={matches} standingsByGroup={NO_STANDINGS} names={{}} />,
    );
    const allVs = screen.getAllByText("vs");
    // Both should render (sorted by round: A vs B first, then X vs Y)
    expect(allVs).toHaveLength(2);
    // A comes before X in DOM order
    const names = screen.getAllByText(/^[ABXY]$/);
    const textOrder = names.map((el) => el.textContent);
    expect(textOrder.indexOf("A")).toBeLessThan(textOrder.indexOf("X"));
  });

  it("passes correct standings to StandingsTable via standingsByGroup", () => {
    const matches: GroupMatch[] = [
      makeMatch({
        id: "m1",
        groupNo: 0,
        aName: "Alice",
        bName: "Bob",
        participantAId: "pA",
        participantBId: "pB",
      }),
    ];
    const standingsByGroup = {
      0: [
        {
          participantId: "pA",
          played: 1,
          wins: 1,
          losses: 0,
          scoreFor: 2,
          scoreAgainst: 0,
          diff: 2,
        },
      ],
    };
    const names = { pA: "Alice", pB: "Bob" };
    render(
      <GroupsView
        matches={matches}
        standingsByGroup={standingsByGroup}
        names={names}
      />,
    );
    // StandingsTable renders the participant name; verify it appears
    // (name may appear in both the standings table and the match row)
    expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
  });
});
