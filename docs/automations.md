# Automations

This plugin has no sources, so there is nothing to schedule: it declares no events feed, no snapshot and no cursor, and
it creates no OpenCode automation. Its `status` and `probe` reads are on demand, and Tavily's five tools run when a
person or an agent calls one.

An **OpenCode automation** may call a Tavily tool in its code action, exactly as a person would. Every run spends
Tavily credits at the prices in the [README](../README.md#cost), and the plugin sets no spending limit. Before you
schedule one, decide how often it may run and which alias it uses, and write the cost into the automation's own text so
the person who owns it sees what each run spends.

Tavily's tools are not a feed: there is no `events_list`, no cursor and no "what changed since last time". An automation
that needs the latest web answer runs a search each time; an automation that needs the person's own data does not
belong here.
