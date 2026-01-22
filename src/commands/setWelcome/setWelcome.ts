import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { ISubscriberRepository } from "../../repositories/ISubscriberRepository";
import { ISettingsRepository } from "../../repositories/settings/ISettingsRepository";
import { GetLogger } from "../../infrastructure/logger";

// Define the steps in our UI flow
type FlowStep = "IDLE" | "AWAITING_INPUT" | "AWAITING_CONFIRMATION";

// Interface for the admin's current state
interface AdminState {
    step: FlowStep;
    draftMessage?: string;
}

// In-memory state store. 
// Note: Since this is an admin-only feature with low concurrency, a Map is efficient and simple.
const adminStates = new Map<number, AdminState>();

export const setWelcomeCommand = (
    bot: Telegraf,
    subscriberRepository: ISubscriberRepository,
    settingsRepository: ISettingsRepository
) => {
    const logger = GetLogger("SetWelcomeCommand");

    // Helper: Reset state
    const resetState = (userId: number) => {
        adminStates.delete(userId);
    };

    // 1. Entry Point: The Command
    bot.command("setwelcome", async (ctx) => {
        try {
            if (!ctx.from) return;
            const userId = ctx.from.id;

            // Authentication Check
            const user = await subscriberRepository.findByTelegramId(userId);
            if (!user?.isAdmin) {
                await ctx.reply("Only admins can use this command.");
                return;
            }

            // Retrieve current greeting for context
            // Assuming settingsRepository has a method to get the current message, 
            // otherwise we skip showing the "Current" block.
            // const currentMsg = await settingsRepository.getWelcomeMessage(); 

            await ctx.reply(
                "📝 **Edit Greeting Message**\n\n" +
                "Please reply with the new text you would like to set.\n" +
                "You can use emojis and standard formatting.",
                {
                    parse_mode: "Markdown",
                    ...Markup.keyboard([["❌ Cancel"]]) // Add a handy cancel button
                        .oneTime()
                        .resize()
                }
            );

            // Set State: Waiting for input
            adminStates.set(userId, { step: "AWAITING_INPUT" });

        } catch (error) {
            logger.error("Error in setWelcome initiation:", error);
            await ctx.reply("An error occurred while starting the update process.");
        }
    });

    // 2. Input Listener: Captures the text
    bot.on(message("text"), async (ctx, next) => {
        const userId = ctx.from.id;
        const state = adminStates.get(userId);

        // If user is not in our flow, pass control to other commands
        if (!state || state.step === "IDLE") {
            return next();
        }

        const text = ctx.message.text;

        // Handle Cancellation
        if (text === "❌ Cancel" || text === "/cancel") {
            resetState(userId);
            await ctx.reply("Operation cancelled.", Markup.removeKeyboard());
            return;
        }

        // Logic for AWAITING_INPUT
        if (state.step === "AWAITING_INPUT") {
            // Validate input (e.g., min length)
            if (text.length < 5) {
                await ctx.reply("⚠️ Message is too short. Please try again.");
                return;
            }

            // Update state with the draft
            adminStates.set(userId, { step: "AWAITING_CONFIRMATION", draftMessage: text });

            // 3. The Preview UI
            await ctx.reply("👁️ **Preview:**");

            // Send the exact preview of how it will look
            await ctx.reply(text);

            await ctx.reply(
                "Does this look good?",
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback("✅ Save & Publish", "btn_save_welcome"),
                        Markup.button.callback("🔄 Rewrite", "btn_rewrite_welcome")
                    ],
                    [Markup.button.callback("❌ Cancel", "btn_cancel_welcome")]
                ])
            );
            return;
        }

        // If in confirmation state but types text, ignore or guide them
        if (state.step === "AWAITING_CONFIRMATION") {
            await ctx.reply("⚠️ Please use the buttons above to Confirm or Rewrite.");
            return;
        }

        return next();
    });

    // 4. Action Handler: Save
    bot.action("btn_save_welcome", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        const state = adminStates.get(userId);
        if (!state || !state.draftMessage) {
            await ctx.answerCbQuery("Session expired. Please start over.");
            return;
        }

        try {
            // Save logic
            await settingsRepository.setWelcomeMessage(state.draftMessage);

            await ctx.deleteMessage();
            await ctx.reply(
                `✅ **Success!** The greeting message has been updated.\n\n"${state.draftMessage}"`,
                {
                    parse_mode: "Markdown",
                    ...Markup.removeKeyboard()
                }
            );

            resetState(userId);

        } catch (error) {
            logger.error("Error saving welcome message:", error);
            await ctx.answerCbQuery("Failed to save.");
        }
    });

    // 5. Action Handler: Rewrite
    bot.action("btn_rewrite_welcome", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        adminStates.set(userId, { step: "AWAITING_INPUT" });

        await ctx.editMessageText("✏️ Okay, let's try again. Please type the new message below:");
        await ctx.answerCbQuery();
    });

    // 6. Action Handler: Cancel
    bot.action("btn_cancel_welcome", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        resetState(userId);
        await ctx.deleteMessage();
        await ctx.reply("❌ Operation cancelled.", Markup.removeKeyboard());
        await ctx.answerCbQuery();
    });
};