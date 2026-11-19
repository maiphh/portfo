/** A provider can implement this interface after card payments are approved. */
export interface CardAdapter {
  disabled(): Response;
}

export const cardAdapter: CardAdapter = {
  disabled: () =>
    Response.json(
      { error: "card_disabled", message: "card disabled" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    ),
};
