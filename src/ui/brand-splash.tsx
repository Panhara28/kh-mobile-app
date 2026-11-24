import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from './theme';

/** The web app's brand gradient (globals.css --brand-from / --brand-to), as on the login screen. */
const BRAND_FROM = '#0B43C7';
const BRAND_TO = '#1F8BFF';

// The phone's own launch screen (app.json: the mark on brand blue) stays up until this screen is drawn.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Takes the phone's launch screen away (also when the app was ready before BrandSplash was ever drawn). */
export function hideLaunchScreen() {
  void SplashScreen.hideAsync().catch(() => undefined);
}

/** While the app starts: the BongIT mark in the middle of the blue brand gradient. */
export function BrandSplash() {
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    // the launch screen has the same blue and mark, so swapping to this one is seamless
    hideLaunchScreen();
    Animated.timing(fade, { toValue: 1, duration: 500, delay: 150, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <View style={styles.page} accessibilityLabel="BongIT">
      <Image source={require('../../assets/brand/bongit-mark-white-icon.png')} style={styles.logo} resizeMode="contain" />
      <Animated.View style={[styles.spinner, { opacity: fade }]}>
        <ActivityIndicator color={colors.primaryForeground} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_FROM,
    experimental_backgroundImage: `linear-gradient(160deg, ${BRAND_FROM} 0%, ${BRAND_TO} 100%)`,
  },
  logo: { width: 120, height: 120 },
  spinner: { position: 'absolute', bottom: '18%' },
});
