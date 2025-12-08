#!/bin/bash

PACKAGE_FILE="package.json"

# 1. Check if file exists
if [ ! -f "$PACKAGE_FILE" ]; then
    echo "Error: $PACKAGE_FILE not found."
    exit 1
fi

# 2. Extract the current version using sed
# This looks for the line "version": "x.x.x" and captures x.x.x
current_version=$(sed -n 's/.*"version": "\([0-9.]*\)".*/\1/p' "$PACKAGE_FILE")

if [ -z "$current_version" ]; then
    echo "Error: Could not find a valid version in $PACKAGE_FILE."
    exit 1
fi

echo "Current version: $current_version"

# 3. Split the version into an array (Major.Minor.Patch)
IFS='.' read -r -a version_parts <<< "$current_version"

# 4. Increment the Patch (the third element, index 2)
((version_parts[2]++))

# 5. Reconstruct the version string
new_version="${version_parts[0]}.${version_parts[1]}.${version_parts[2]}"

# 6. Use sed -i to replace the old version with the new version in the file
# We use the variable expansion in the sed string
sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$PACKAGE_FILE"

echo "Updated version to: $new_version"

# 7. Update package-lock.json
echo "Updating package-lock.json..."
# This command ensures the 'version' field inside package-lock.json matches package.json
npm install
echo "package-lock.json synchronized."
