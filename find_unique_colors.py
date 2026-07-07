import json, re

with open("docs/gruvbox-material-dark.json") as f:
    data = f.read()

colors = set(re.findall(r"#[0-9a-fA-F]{6,8}", data))

with open("docs/unique_colors.txt", "w") as f:
    f.write("\n".join(sorted(colors)))

print(f"Found {len(colors)} unique colors")
