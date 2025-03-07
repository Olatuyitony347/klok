#!/bin/bash

while true; do
    # Remove and recreate privateKeys.txt
    rm -rf privateKeys.txt
    touch privateKeys.txt

    # Properly reset tokens.json
    echo '{}' > tokens.json

    # Run ref.js and wait for it to finish successfully
    echo "Running ref.js..."
    node ref.js
    while [ $? -ne 0 ]; do
        echo "ref.js encountered an error. Retrying in 5 minutes..."
        sleep 30
        echo "Retrying ref.js..."
        node ref.js
    done

    # Run bot.js and monitor output
    echo "Running bot.js..."
    node bot.js | while IFS= read -r line; do
        echo "$line"
        if echo "$line" | grep -q "Waiting 1 hours before trying again"; then
            echo "Detected rate limit message. Terminating bot.js..."
            pkill -f "node bot.js"
            break
        fi
    done

    # Restart the cycle immediately
    echo "Restarting the cycle..."
done
