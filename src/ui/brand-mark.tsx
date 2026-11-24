import { Image, StyleSheet, View } from 'react-native';

/** The white BongIT mark in a soft circle, for the blue headers (the web shows it at the top of its blue sidebar). */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={require('../../assets/brand/bongit-mark-white-icon.png')}
        style={{ width: size * 0.58, height: size * 0.58 }}
        resizeMode="contain"
        accessibilityLabel="BongIT"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
