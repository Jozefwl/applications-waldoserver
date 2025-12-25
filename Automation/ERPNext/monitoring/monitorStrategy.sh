#!/bin/bash
# deployment strategy monitoring tracker

echo "Which strategy?"
echo "1. Ramped"
echo "2. Rolling"
echo "3. Recreate"
echo "4. BlueGreen"
echo "5. Canary"
echo "6. Shadow"
read -p "Write number 1-6: " choice

# map choice to strategy name
case $choice in
    1) strategy="Ramped" ;;
    2) strategy="Rolling" ;;
    3) strategy="Recreate" ;;
    4) strategy="BlueGreen" ;;
    5) strategy="Canary" ;;
    6) strategy="Shadow" ;;
    *) echo "invalid choice"; exit 1 ;;
esac

# create monitoring file
filename="${strategy}-monitoring.txt"

read -p "Press enter to save date of begin of monitoring"
begin_time=$(date +%Y-%m-%dT%H:%M:%S)
echo "Beginning: $begin_time" > "$filename"

read -p "Press enter to save date of end of monitoring"
end_time=$(date +%Y-%m-%dT%H:%M:%S)
echo "End: $end_time" >> "$filename"

echo ""
echo "monitoring saved to $filename"
cat "$filename"
