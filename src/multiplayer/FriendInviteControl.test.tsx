// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FriendInviteControl } from "./FriendInviteControl";

afterEach(cleanup);

const friends = [
  { publicId: "gc-athena22", displayName: "Athena" },
  { publicId: "gc-ares3344", displayName: "Ares" },
];

describe("friend invite control", () => {
  it("sends the selected accepted friend a room invitation", async () => {
    const invite = vi.fn(async () => undefined);
    render(<FriendInviteControl friends={friends} onInvite={invite} />);

    fireEvent.change(screen.getByLabelText(/invite a friend/i), {
      target: { value: "gc-athena22" },
    });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => expect(invite).toHaveBeenCalledWith("gc-athena22"));
    expect(await screen.findByText(/invitation sent/i)).toBeTruthy();
  });

  it("disables duplicate pending invitations", () => {
    render(
      <FriendInviteControl
        friends={friends}
        pendingPublicIds={["gc-athena22"]}
        onInvite={vi.fn()}
      />,
    );
    const option = screen.getByRole("option", {
      name: /Athena.*invited/i,
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });
});
