const fs = require('fs');
const file = 'mobile/src/screens/RenterPortalScreen.tsx';
let code = fs.readFileSync(file, 'utf8');

// Update tabs
code = code.replace(
  /const RENTER_TABS = \["details", "fees", "repairs", "notices", "settings"\] as const;/,
  'const RENTER_TABS = ["menu", "details", "fees", "repairs", "notices", "settings"] as const;'
);

code = code.replace(
  /const \[activeTab, setActiveTab\] = useState<RenterTab>\("details"\);/,
  'const [activeTab, setActiveTab] = useState<RenterTab>("menu");'
);

// Add GridItem Component right after RenterTab definition
if (!code.includes('function GridItem')) {
  const gridItemCode = `
function GridItem({ icon, title, subtitle, bg, fg, danger, onPress, theme, isDark }: any) {
  return (
    <TouchableOpacity
      style={[
        {
          backgroundColor: isDark ? theme.surfaceSecondary : '#FFFFFF',
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.3 : 0.04,
          shadowRadius: 8,
          elevation: 2,
        },
        danger && { borderColor: theme.danger + '40', backgroundColor: isDark ? theme.danger + '15' : theme.dangerLight },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: danger ? theme.danger : theme.text, marginBottom: 4, letterSpacing: -0.3 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: danger ? theme.danger : theme.secondary, opacity: 0.8 }} numberOfLines={1}>{subtitle}</Text>
    </TouchableOpacity>
  );
}
`;
  code = code.replace('export function RenterPortalScreen', gridItemCode + '\nexport function RenterPortalScreen');
}

// Add the menu tab JSX
const menuTabJSX = `
          {/* ================= TAB 0: MENU ================= */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.primary]} tintColor={theme.primary} />
              }
            >
              <View style={s.sectionHeaderRow}>
                <View>
                  <Text style={[s.sectionTitle, { color: theme.text }]}>Menu</Text>
                  <Text style={[s.sectionSubtitle, { color: theme.secondary }]}>
                    Navigate your hostel services.
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 }}>
                <View style={{ width: '47%' }}>
                  <GridItem
                    icon="person-outline"
                    title="My Profile"
                    subtitle="Personal details"
                    fg={theme.primary}
                    bg={theme.primaryLight}
                    onPress={() => handleTabPress("details")}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <GridItem
                    icon="wallet-outline"
                    title="Rent & Fees"
                    subtitle="Pay your dues"
                    fg={theme.success}
                    bg={theme.successLight}
                    onPress={() => handleTabPress("fees")}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <GridItem
                    icon="build-outline"
                    title="Fix Problems"
                    subtitle="Lodge a complaint"
                    fg={theme.warning}
                    bg={theme.warningLight}
                    onPress={() => handleTabPress("repairs")}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <GridItem
                    icon="megaphone-outline"
                    title="Notices"
                    subtitle="Hostel updates"
                    fg={theme.purple || "#8B5CF6"}
                    bg={isDark ? "rgba(139, 92, 246, 0.16)" : "#F5F3FF"}
                    onPress={() => handleTabPress("notices")}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <GridItem
                    icon="settings-outline"
                    title="Settings"
                    subtitle="App & Account"
                    fg={theme.secondary}
                    bg={theme.surfaceSecondary}
                    onPress={() => handleTabPress("settings")}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>
                <View style={{ width: '47%' }}>
                  <GridItem
                    icon="log-out-outline"
                    title="Logout"
                    subtitle="Exit the app"
                    danger
                    fg={theme.danger}
                    bg={theme.dangerLight}
                    onPress={() => {
                      Alert.alert("Logout", "Are you sure you want to exit?", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Logout", style: "destructive", onPress: onLogout }
                      ]);
                    }}
                    theme={theme}
                    isDark={isDark}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
`;

if (!code.includes('TAB 0: MENU')) {
  code = code.replace(
    /\{\/\* ================= TAB 1: DETAILS ================= \*\/\}/,
    menuTabJSX + '\n\n          {/* ================= TAB 1: DETAILS ================= */}'
  );
}

fs.writeFileSync(file, code, 'utf8');
console.log('RenterPortalScreen updated');
