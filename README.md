# Discord Location Tracker Bot

A Discord bot that helps players track their in-game locations using simple slash commands.

## Features

- **Set Your Location**: Use `/setlocation` to tell others where you are in the game
- **Check Your Location**: Use `/whereami` to see your current saved location
- **Find Other Players**: Use `/whereis @user` to see where another player is
- **View All Locations**: Use `/locations` to see everyone's current location
- **Mark as Inactive**: Use `/clearme` to remove yourself from location tracking
- **Admin Reset**: Administrators can use `/clearall` to clear all location data

## Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/setlocation [location]` | Set your current game location (type to search) | `/setlocation` then type to find your location |
| `/whereami` | Check your own saved location | `/whereami` |
| `/whereis [user]` | Check where another player is | `/whereis @PlayerName` |
| `/locations` | List all tracked player locations | `/locations` |
| `/clearme` | Remove yourself from tracking (mark as inactive) | `/clearme` |
| `/clearall` | [ADMIN] Clear all player location data | `/clearall` |

## How to Use

1. **Set Your Location**: Type `/setlocation` in any channel where the bot is present, then start typing your location. The bot will show autocomplete suggestions as you type. Currently supports 30 locations including all Routes (1-4, 6-25), Mudbray Ranch, New Haven, Nightshade, Shore's End, Stillwater Quarry, and Wild Overgrowth

2. **Check Locations**: Use `/whereami` to see your own location, or `/whereis @username` to check on other players

3. **View Everyone**: Use `/locations` to see a complete list of all tracked players and their current locations

4. **Mark as Inactive**: When you're done playing or want to be removed from tracking, use `/clearme` to clear your location

5. **Admin Commands**: Users with Administrator permissions can use `/clearall` to reset all location data

## Technical Details

- Built with discord.js v14
- Uses in-memory storage (locations reset when bot restarts)
- Responds with clean embedded messages
- Includes timestamps for last location updates

## Running the Bot

The bot is configured to start automatically. You can also:
- Deploy commands: `npm run deploy`
- Start manually: `npm start`

## Notes

- Location data is stored in memory and will be cleared if the bot restarts
- Only one location per player is tracked (setting a new location overwrites the old one)
- All users can see all locations (no privacy filters in this version)
